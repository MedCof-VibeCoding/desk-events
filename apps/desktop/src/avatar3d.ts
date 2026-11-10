import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export type MovimentoAvatar = 'Idle' | 'Walk' | 'Type' | 'Wave';

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
  constructor(gltf: GLTF) {
    this.root = new THREE.Group();
    const modelo = clone(gltf.scene);
    modelo.updateMatrixWorld(true);
    modelo.traverse(o => { const mesh = o as THREE.SkinnedMesh; if (mesh.isSkinnedMesh) mesh.skeleton.update(); });
    const caixa = new THREE.Box3().setFromObject(modelo, true);
    const escala = 1.85 / Math.max(0.01, caixa.max.y - caixa.min.y);
    modelo.scale.multiplyScalar(escala);
    modelo.position.set(-(caixa.max.x + caixa.min.x) * escala / 2, -caixa.min.y * escala, -(caixa.max.z + caixa.min.z) * escala / 2);
    modelo.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true; mesh.receiveShadow = true;
        const materiais = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(m => m.clone());
        this.materiais.push(...materiais);
        mesh.material = Array.isArray(mesh.material) ? materiais : materiais[0];
      }
    });
    this.root.add(modelo);
    this.mixer = new THREE.AnimationMixer(modelo);
    for (const clip of gltf.animations) this.mixer.clipAction(clip);
    this.clips = gltf.animations;
    this.passo(0, 'Idle');
  }
  private clips: THREE.AnimationClip[];
  passo(dt: number, movimento: MovimentoAvatar, parado = false) {
    const clip = this.clips.find(c => c.name === (parado ? 'Idle' : movimento));
    if (clip && this.atual?.getClip() !== clip) {
      const anterior = this.atual;
      this.atual = this.mixer.clipAction(clip).reset().play();
      if (anterior) { anterior.fadeOut(0.18); this.atual.fadeIn(0.18); }
    }
    if (parado && this.atual) { this.atual.time = 0; this.mixer.update(0); }
    else this.mixer.update(dt);
  }
  opacidade(valor: number) {
    for (const m of this.materiais) { const transparente = valor < 1; if (m.transparent !== transparente) { m.transparent = transparente; m.needsUpdate = true; } m.opacity = valor; }
  }
  destruir() {
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.mixer.getRoot());
    this.materiais.forEach(m => m.dispose());
    this.root.traverse(o => { const mesh = o as THREE.SkinnedMesh; if (mesh.isSkinnedMesh) mesh.skeleton.dispose(); });
  }
}

// A geometria é compartilhada; cada agente tem esqueleto, materiais e animação próprios.
export class ModelosAvatar {
  private modelos = new Map<string, Promise<GLTF>>();
  private encerrado = false;
  async criar(url: string): Promise<AvatarAnimado | null> {
    if (this.encerrado) return null;
    let promessa = this.modelos.get(url);
    if (!promessa) {
      promessa = new GLTFLoader().loadAsync(url).catch(erro => { this.modelos.delete(url); throw erro; });
      this.modelos.set(url, promessa);
    }
    const gltf = await promessa;
    return this.encerrado ? null : new AvatarAnimado(gltf);
  }
  destruir() {
    this.encerrado = true;
    this.modelos.forEach(p => { void p.then(g => liberarModelo(g.scene)).catch(() => {}); });
    this.modelos.clear();
  }
}
