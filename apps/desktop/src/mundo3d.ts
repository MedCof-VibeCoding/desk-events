import { avatarDe } from './personagens';
import { ModelosAvatar, type AvatarAnimado } from './avatar3d';
import * as THREE from 'three';
import { montarSala, montarPosto, type Posto } from './mobilia3d';
import type { Agente, Aparencia } from './supabase';

// Mundo 3D do escritório: sala, móveis e bonecos. Sem DOM, para poder ser testado fora do navegador.
const MESAS_X = [-5.4, -1.8, 1.8, 5.4];
const FILEIRAS_Z = [-1.5, 1.5, 4.5];
const FAIXAS = [-3.2, 0.3, 3.3, 6.3];
const PONTOS = [{ x: -8.4, z: -3.2 }, { x: 7.6, z: -3.2 }, { x: 0, z: -3.2 }, { x: 8.4, z: 0.3 }, { x: 7.4, z: 6.3 }, { x: -7.6, z: 6.3 }, { x: -8.2, z: 3.3 }];
const VEL = 1.7;

type P = { x: number; z: number };
export const mesaDe = (i: number): P => ({ x: MESAS_X[i % 4], z: FILEIRAS_Z[Math.floor(i / 4) % 3] });
const casaDe = (i: number): P => { const m = mesaDe(i); return { x: m.x, z: m.z + 0.95 }; };
const faixaPerto = (z: number) => FAIXAS.reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a));
const colunaLivre = (x: number) => MESAS_X.every(c => Math.abs(x - c) > 1.3);
function colunaPerto(x: number) {
  if (colunaLivre(x)) return x;
  for (let d = 0.1; d < 3; d += 0.1) { if (colunaLivre(x - d)) return x - d; if (colunaLivre(x + d)) return x + d; }
  return x;
}
// Caminho em linhas retas pelos corredores, sem atravessar as mesas.
export function tracar(de: P, para: P): P[] {
  const fa = faixaPerto(de.z), fb = faixaPerto(para.z);
  const a = colunaPerto(de.x), b = colunaPerto(para.x);
  const pts: P[] = fa === fb ? [{ x: de.x, z: fa }, { x: para.x, z: fb }, para] : [{ x: de.x, z: fa }, { x: a, z: fa }, { x: a, z: fb }, { x: para.x, z: fb }, para];
  return pts.filter((p, i) => { const q = i ? pts[i - 1] : de; return Math.abs(p.x - q.x) > 0.01 || Math.abs(p.z - q.z) > 0.01; });
}

interface Boneco {
  grupo: THREE.Group; corpo: THREE.Group; anel: THREE.Mesh; avatar: THREE.Sprite;
  animado?: AvatarAnimado;
  rota: P[]; espera: number; ocupado: boolean; festa: number; fase: number; chave: string; indice: number;
}
function montarBoneco(ap: Aparencia, textura: THREE.Texture): Pick<Boneco, 'grupo' | 'corpo' | 'anel' | 'avatar'> {
  const grupo = new THREE.Group(), corpo = new THREE.Group();
  grupo.add(corpo);
  const material = new THREE.SpriteMaterial({ map: textura, transparent: true, alphaTest: 0.1, depthWrite: false });
  const avatar = new THREE.Sprite(material);
  avatar.center.set(0.5, 0);
  avatar.scale.set(1.85, 1.85, 1);
  corpo.add(avatar);
  const anel = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 24), new THREE.MeshBasicMaterial({ color: ap.cor, side: THREE.DoubleSide }));
  anel.rotation.x = -Math.PI / 2; anel.position.y = 0.02; anel.visible = false; grupo.add(anel);
  return { grupo, corpo, anel, avatar };
}

function descartarBoneco(b: Boneco) {
  b.animado?.destruir();
  if (b.animado) b.corpo.remove(b.animado.root);
  b.avatar.material.dispose();
  b.anel.geometry.dispose();
  (b.anel.material as THREE.Material).dispose();
  // Texturas pertencem ao cache do mundo; sprites compartilham a geometria.
}

export class Mundo {
  scene = new THREE.Scene();
  private bonecos = new Map<string, Boneco>();
  private texturas = new Map<string, THREE.Texture>();
  private postos = new Map<number, Posto>();
  private modelos = new ModelosAvatar();

  constructor() {
    this.scene.background = new THREE.Color('#080808');
    this.scene.add(new THREE.HemisphereLight('#FFF7EB', '#77716A', 1.8));
    const sol = new THREE.DirectionalLight('#FFF3E0', 1.6);
    sol.position.set(4, 16, 8); sol.shadow.bias = -0.0003; sol.shadow.normalBias = 0.035; sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
    Object.assign(sol.shadow.camera, { left: -14, right: 14, top: 12, bottom: -12, near: 1, far: 50 });
    this.scene.add(sol);
    montarSala(this.scene);
    for (let i = 0; i < 12; i++) this.postos.set(i, montarPosto(this.scene, mesaDe(i), i));
  }

  // Cria, atualiza e remove bonecos e mesas conforme a lista de agentes.
  sync(agentes: Agente[], ocupados: Set<string>, selecionado: string | null) {
    const vivos = new Set(agentes.map(a => a.id));
    for (const [id, b] of this.bonecos) if (!vivos.has(id)) { this.scene.remove(b.grupo); descartarBoneco(b); this.bonecos.delete(id); }
    agentes.forEach((a, i) => {
      const slot = i % 12;
      const chave = JSON.stringify(a.aparencia);
      let b = this.bonecos.get(a.id);
      if (!b || b.chave !== chave) {
        const antigo = b; if (antigo) { this.scene.remove(antigo.grupo); descartarBoneco(antigo); }
        const personagem = avatarDe(a.aparencia);
        let textura = this.texturas.get(personagem.id);
        if (!textura) {
          textura = new THREE.TextureLoader().load(personagem.imagem);
          textura.colorSpace = THREE.SRGBColorSpace;
          this.texturas.set(personagem.id, textura);
        }
        const m = montarBoneco(a.aparencia, textura), lar = casaDe(slot);
        m.grupo.position.set(antigo?.grupo.position.x ?? lar.x, 0, antigo?.grupo.position.z ?? lar.z);
        m.grupo.rotation.y = Math.PI; m.grupo.userData.id = a.id;
        b = { ...m, rota: antigo?.rota ?? [], espera: 1 + Math.random() * 4, ocupado: false, festa: 0, fase: Math.random() * 6, chave, indice: slot };
        this.bonecos.set(a.id, b); this.scene.add(m.grupo);
        const atual = b;
        void this.modelos.criar(personagem.modelo).then(animado => {
          if (!animado) return;
          if (this.bonecos.get(a.id) !== atual) { animado.destruir(); return; }
          atual.animado = animado; atual.corpo.add(animado.root);
          animado.opacidade(atual.grupo.userData.ativo === false ? 0.45 : 1);
          atual.avatar.visible = false;
        }).catch(() => { /* A prévia mantém o agente visível se o GLB não carregar. */ });
      }
      b.indice = slot;
      const ocupado = ocupados.has(a.id) && a.ativo;
      if (ocupado && !b.ocupado) b.rota = tracar({ x: b.grupo.position.x, z: b.grupo.position.z }, casaDe(slot));
      if (!ocupado && b.ocupado) { b.festa = 1.6; b.espera = 2.5; }
      b.ocupado = ocupado;
      b.anel.visible = selecionado === a.id;
      b.avatar.material.opacity = a.ativo ? 1 : 0.45;
      b.animado?.opacidade(a.ativo ? 1 : 0.45);
      b.grupo.userData.ativo = a.ativo;
    });
  }

  passo(dt: number, parado = false) {
    const ligadas = new Set<number>();
    for (const b of this.bonecos.values()) {
      const pos = b.grupo.position, lar = casaDe(b.indice), ativo = b.grupo.userData.ativo !== false;
      b.fase += dt;
      if (parado) { pos.set(lar.x, 0, lar.z); b.rota = []; }
      else if (b.rota.length) {
        const alvo = b.rota[0], dx = alvo.x - pos.x, dz = alvo.z - pos.z, d = Math.hypot(dx, dz), anda = VEL * dt;
        if (d <= anda) { pos.x = alvo.x; pos.z = alvo.z; b.rota.shift(); } else { pos.x += (dx / d) * anda; pos.z += (dz / d) * anda; b.grupo.rotation.y = Math.atan2(dx, dz); }
      } else if (!b.ocupado && ativo) {
        b.espera -= dt;
        if (b.espera <= 0) {
          const r = Math.random();
          const destino = r < 0.3 ? lar : r < 0.75 ? PONTOS[Math.floor(Math.random() * PONTOS.length)] : { x: -8 + Math.random() * 15.6, z: FAIXAS[Math.floor(Math.random() * FAIXAS.length)] };
          b.rota = tracar({ x: pos.x, z: pos.z }, destino); b.espera = 2 + Math.random() * 6;
        }
      }
      const andando = b.rota.length > 0, naMesa = !andando && b.ocupado;
      if (naMesa) { b.grupo.rotation.y = Math.PI; ligadas.add(b.indice); }
      if (b.festa > 0) b.festa -= dt;
      b.corpo.position.y = parado ? 0 : andando ? Math.abs(Math.sin(b.fase * 11)) * 0.05 : naMesa ? Math.sin(b.fase * 9) * 0.02 : b.festa > 0 ? Math.abs(Math.sin(b.fase * 9)) * 0.35 : Math.sin(b.fase * 2) * 0.015;
      if (b.animado) { b.corpo.position.y = 0; b.animado.passo(dt, andando ? 'Walk' : naMesa ? 'Type' : b.festa > 0 ? 'Wave' : 'Idle', parado || !ativo); }
    }
    for (const [slot, p] of this.postos) p.tela.emissive.set(ligadas.has(slot) ? (parado || Math.sin(performance.now() / 160) > 0 ? '#2FBF6E' : '#1F8F52') : '#000000');
  }

  // Posição da etiqueta de cada agente, acima da cabeça.
  etiqueta(id: string, saida: THREE.Vector3): boolean {
    const b = this.bonecos.get(id); if (!b) return false;
    saida.set(b.grupo.position.x, 2.15 + b.corpo.position.y, b.grupo.position.z); return true;
  }
  ocupadoNaMesa(id: string) { const b = this.bonecos.get(id); return !!b && b.ocupado && !b.rota.length; }

  // Qual agente está sob o clique.
  alvo(raio: THREE.Raycaster): string | null {
    const hits = raio.intersectObjects([...this.bonecos.values()].map(b => b.grupo), true);
    for (const h of hits) { let o: THREE.Object3D | null = h.object; while (o) { if (o.userData.id) return o.userData.id as string; o = o.parent; } }
    return null;
  }
  posicao(id: string) { const b = this.bonecos.get(id); return b ? { x: b.grupo.position.x, z: b.grupo.position.z } : null; }

  destruir() {
    this.bonecos.forEach(b => { descartarBoneco(b); this.scene.remove(b.grupo); });
    this.bonecos.clear(); this.modelos.destruir();
    this.texturas.forEach(t => t.dispose());
    this.texturas.clear();
    this.scene.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(mt)) mt.forEach(x => x.dispose()); else mt?.dispose(); });
  }
}
