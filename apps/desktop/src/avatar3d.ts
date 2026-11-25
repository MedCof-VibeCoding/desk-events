import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { Aparencia } from './supabase';
import { avatarDe } from './personagens';
import { personalizarAvatar3D } from './personagemPersonalizado3d';
import { aplicarEstiloDesenho } from './estiloDesenho3d';

export type MovimentoAvatar = 'Idle' | 'Walk' | 'Type' | 'Wave';
export interface AvatarMovel {
  root: THREE.Group;
  passo(dt:number, movimento:MovimentoAvatar, parado?:boolean, velocidade?:number):void;
  opacidade(valor:number):void;
  destruir():void;
}

// Velocidade do pé apoiado no clipe Walk, com o avatar normalizado para 1,85 m.
const VELOCIDADE_PASSADA = 0.5;

function liberarModelo(root: THREE.Object3D) {
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
    }
  });
}

export class AvatarAnimado {
  root: THREE.Group;
  private mixer: THREE.AnimationMixer;
  private atual?: THREE.AnimationAction;
  private materiais: THREE.Material[] = [];
  private geometrias: THREE.BufferGeometry[] = [];
  constructor(gltf: GLTF, aparencia?: Aparencia) {
    this.root = new THREE.Group();
    const modelo = clone(gltf.scene);
    modelo.updateMatrixWorld(true);
    modelo.traverse(o => { const mesh = o as THREE.SkinnedMesh; if (mesh.isSkinnedMesh) mesh.skeleton.update(); });
    const caixa = new THREE.Box3().setFromObject(modelo, true);
    modelo.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true; mesh.receiveShadow = true;
        const materiais = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(m => m.clone());
        this.materiais.push(...materiais);
        mesh.material = Array.isArray(mesh.material) ? materiais : materiais[0];
      }
    });
    // Keep the reference body's scale: a hat must not change stride length.
    if (aparencia?.estilo === 'pixel') {
      this.geometrias = personalizarAvatar3D(modelo, aparencia);
      // Cel shading e contorno aproximam o volume 3D da arte em pixel.
      this.materiais.forEach(m => m.dispose());
      this.materiais = aplicarEstiloDesenho(modelo).materiais;
      modelo.traverse(o => { if (o.userData.flutuar) this.flutuantes.push({ obj: o, y: o.position.y }); });
      modelo.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || mesh.userData.contorno) return;
        mesh.castShadow = true; mesh.receiveShadow = true;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (!this.materiais.includes(material)) this.materiais.push(material);
        }
      });
    }
    const escala = 1.85 / Math.max(0.01, caixa.max.y - caixa.min.y);
    modelo.scale.multiplyScalar(escala);
    modelo.position.set(-(caixa.max.x + caixa.min.x) * escala / 2, -caixa.min.y * escala, -(caixa.max.z + caixa.min.z) * escala / 2);
    this.root.add(modelo);
    this.mixer = new THREE.AnimationMixer(modelo);
    for (const clip of gltf.animations) this.mixer.clipAction(clip);
    this.clips = gltf.animations;
    this.passo(0, 'Idle');
  }
  private clips: THREE.AnimationClip[];
  private tempo = 0;
  private flutuantes: { obj: THREE.Object3D; y: number }[] = [];
  passo(dt: number, movimento: MovimentoAvatar, parado = false, velocidade = VELOCIDADE_PASSADA) {
    const clip = this.clips.find(c => c.name === (parado ? 'Idle' : movimento));
    if (clip && this.atual?.getClip() !== clip) {
      const anterior = this.atual;
      this.atual = this.mixer.clipAction(clip).reset().play();
      if (anterior) { anterior.fadeOut(0.18); this.atual.fadeIn(0.18); }
    }
    if (!parado) this.tempo += dt;
    for (const f of this.flutuantes) f.obj.position.y = f.y + Math.sin(this.tempo * 2.2) * 0.03;
    this.atual?.setEffectiveTimeScale(clip?.name === 'Walk' ? Math.max(0, velocidade) / VELOCIDADE_PASSADA : 1);
    if (parado && this.atual) { this.atual.time = 0; this.mixer.update(0); }
    else this.mixer.update(dt);
  }
  opacidade(valor: number) {
    for (const m of this.materiais) {
      // Translucent accessories (holograms) keep their own base opacity.
      const base = typeof m.userData.opacidadeBase === 'number' ? m.userData.opacidadeBase : 1;
      const transparente = valor < 1 || base < 1;
      if (m.transparent !== transparente) { m.transparent = transparente; m.needsUpdate = true; }
      m.opacity = valor * base;
    }
  }
  destruir() {
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.mixer.getRoot());
    this.materiais.forEach(m => m.dispose());
    this.geometrias.forEach(g => g.dispose());
    this.root.traverse(o => { const mesh = o as THREE.SkinnedMesh; if (mesh.isSkinnedMesh) mesh.skeleton.dispose(); });
  }
}

// A geometria é compartilhada; cada agente tem esqueleto, materiais e animação próprios.
export class ModelosAvatar {
  private modelos = new Map<string, Promise<GLTF>>();
  private encerrado = false;
  async criarAparencia(ap:Aparencia):Promise<AvatarMovel | null> {
    if (this.encerrado) return null;
    if (ap.estilo !== 'pixel') return this.criar(avatarDe(ap).modelo);
    return this.criar('/avatars/atlas-m-casual.glb', ap);
  }
  async criar(url: string, aparencia?: Aparencia): Promise<AvatarAnimado | null> {
    if (this.encerrado) return null;
    let promessa = this.modelos.get(url);
    if (!promessa) {
      promessa = new GLTFLoader().loadAsync(url).catch(erro => { this.modelos.delete(url); throw erro; });
      this.modelos.set(url, promessa);
    }
    const gltf = await promessa;
    return this.encerrado ? null : new AvatarAnimado(gltf, aparencia);
  }
  destruir() {
    this.encerrado = true;
    this.modelos.forEach(p => { void p.then(g => liberarModelo(g.scene)).catch(() => {}); });
    this.modelos.clear();
  }
}
