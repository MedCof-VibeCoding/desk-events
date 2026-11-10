import * as THREE from 'three';
import type { Agente, Aparencia } from './supabase';

// Mundo 3D do escritório: sala, móveis e bonecos. Sem DOM, para poder ser testado fora do navegador.
const MESAS_X = [-5.4, -1.8, 1.8, 5.4];
const FILEIRAS_Z = [-1.5, 1.5, 4.5];
const FAIXAS = [-3.2, 0.3, 3.3, 6.3];
const PONTOS = [{ x: -8.6, z: -3.2 }, { x: 8.4, z: -3.2 }, { x: 0, z: -3.2 }, { x: 8.6, z: 0.3 }, { x: 8.2, z: 6.3 }, { x: -8.6, z: 6.3 }, { x: -8.6, z: 3.3 }];
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

const mat = (cor: number | string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color: cor, ...extra });
function caixa(pai: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, sombra = true) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z); o.castShadow = sombra; o.receiveShadow = true; pai.add(o);
  return o;
}

function montarSala(scene: THREE.Scene) {
  const piso = new THREE.Mesh(new THREE.BoxGeometry(21, 0.3, 15.6), mat('#E8D8BE'));
  piso.position.set(0, -0.15, 0.2); piso.receiveShadow = true; scene.add(piso);
  const tabua = mat('#DCCAAC');
  for (let z = -7; z < 8; z += 1.2) caixa(scene, 21, 0.01, 0.03, 0, 0.006, z, tabua, false);
  const parede = mat('#C3C0D2'), topo = mat('#8E8AA6'), escuro = mat('#2A2E45');
  const muro = (w: number, d: number, x: number, z: number, h = 2.4) => { caixa(scene, w, h, d, x, h / 2, z, parede); caixa(scene, w + 0.04, 0.08, d + 0.04, x, h + 0.04, z, topo, false); };
  muro(21, 0.25, 0, -7.6); muro(0.25, 15.6, -10.5, 0.2);
  // sala de reunião no canto, com paredes baixas
  muro(0.2, 2.6, -1.2, -6.2, 1.5); muro(3.2, 0.2, -4.6, -4.2, 1.5); muro(2.2, 0.2, -9.3, -4.2, 1.5);
  // quadros e janelas
  [[-7.5, 1.5, 2.2], [-3, 1.5, 1.6], [3, 1.5, 2.6], [7.5, 1.5, 1.6]].forEach(([x, y, w]) => caixa(scene, w, 0.9, 0.06, x, y, -7.44, escuro, false));
  [[-3, 1.5], [3.5, 1.5]].forEach(([z, y]) => caixa(scene, 0.06, 0.9, 2, -10.34, y, z, escuro, false));
  // mesa de reunião
  const madeira = mat('#C98D5E'), madeiraEsc = mat('#8C5A38');
  const tampo = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.12, 6), madeira); tampo.position.set(-6, 0.78, -5.9); tampo.castShadow = true; scene.add(tampo);
  const pe = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 0.72, 6), madeiraEsc); pe.position.set(-6, 0.36, -5.9); scene.add(pe);
  // balcão, estantes, sofás, plantas
  caixa(scene, 3.2, 1, 0.8, 4.2, 0.5, -5.6, madeiraEsc); caixa(scene, 0.8, 1, 1.8, 6.2, 0.5, -6.1, madeiraEsc); caixa(scene, 3.3, 0.08, 0.9, 4.2, 1.04, -5.6, madeira, false);
  const estante = (x: number, z: number) => { caixa(scene, 1.2, 2, 0.45, x, 1, z, madeiraEsc); [0.5, 1, 1.5].forEach((y, i) => caixa(scene, 1, 0.22, 0.3, x, y + 0.1, z + 0.1, mat(['#D9487E', '#3E6AE0', '#E3A008'][i]), false)); };
  estante(9.2, -6.9); estante(0.6, -6.9);
  const sofa = (x: number, z: number, cor: string, gira = 0) => { const g = new THREE.Group(); caixa(g, 2.4, 0.45, 0.95, 0, 0.3, 0, mat(cor)); caixa(g, 2.4, 0.6, 0.25, 0, 0.75, -0.35, mat(cor)); caixa(g, 0.25, 0.4, 0.95, -1.08, 0.6, 0, mat(cor)); caixa(g, 0.25, 0.4, 0.95, 1.08, 0.6, 0, mat(cor)); g.position.set(x, 0, z); g.rotation.y = gira; scene.add(g); };
  sofa(9.4, 4.6, '#5B5F8C', -Math.PI / 2); sofa(-9.4, 4.6, '#5B5F8C', Math.PI / 2);
  const planta = (x: number, z: number) => { caixa(scene, 0.45, 0.45, 0.45, x, 0.22, z, mat('#B5633C')); const f = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.2, 6), mat('#3F9A4B')); f.position.set(x, 1.05, z); f.castShadow = true; scene.add(f); };
  planta(-9.6, 7); planta(9.4, 7); planta(9.4, -3.9); planta(-2, -6.9);
  caixa(scene, 0.5, 1.1, 0.5, 9.5, 0.55, 0.3, mat('#E4E8EF')); caixa(scene, 0.36, 0.5, 0.36, 9.5, 1.35, 0.3, mat('#9BD7FF', { transparent: true, opacity: 0.85 }));
  caixa(scene, 1, 0.9, 0.6, -9.6, 0.45, -3.4, madeiraEsc); caixa(scene, 0.4, 0.5, 0.35, -9.6, 1.15, -3.4, mat('#3B3F4F'));
}

interface Posto { grupo: THREE.Group; tela: THREE.MeshLambertMaterial }
function montarPosto(scene: THREE.Scene, m: P): Posto {
  const g = new THREE.Group(); g.position.set(m.x, 0, m.z);
  const madeira = mat('#B9814F'), esc = mat('#7A5233'), cinza = mat('#3B4052');
  caixa(g, 1.7, 0.08, 0.85, 0, 0.76, 0, madeira); caixa(g, 0.08, 0.72, 0.8, -0.78, 0.36, 0, esc); caixa(g, 0.08, 0.72, 0.8, 0.78, 0.36, 0, esc); caixa(g, 1.5, 0.4, 0.05, 0, 0.5, -0.36, esc);
  caixa(g, 0.62, 0.4, 0.05, 0, 1.08, -0.18, cinza); caixa(g, 0.08, 0.14, 0.08, 0, 0.86, -0.18, cinza);
  const tela = mat('#10162A', { emissive: new THREE.Color('#000000') });
  caixa(g, 0.54, 0.32, 0.02, 0, 1.08, -0.145, tela, false);
  caixa(g, 0.5, 0.03, 0.18, 0, 0.815, 0.12, cinza, false); caixa(g, 0.12, 0.14, 0.12, 0.62, 0.87, 0.18, mat('#F2F2F2'), false);
  // cadeira
  caixa(g, 0.5, 0.08, 0.5, 0, 0.46, 1.1, cinza); caixa(g, 0.5, 0.55, 0.08, 0, 0.78, 1.34, cinza); caixa(g, 0.08, 0.44, 0.08, 0, 0.22, 1.1, cinza);
  scene.add(g);
  return { grupo: g, tela };
}

interface Boneco {
  grupo: THREE.Group; corpo: THREE.Group; pernaA: THREE.Mesh; pernaB: THREE.Mesh; anel: THREE.Mesh; olhos: THREE.MeshLambertMaterial;
  rota: P[]; espera: number; ocupado: boolean; festa: number; fase: number; chave: string; indice: number;
}
function montarBoneco(ap: Aparencia): Pick<Boneco, 'grupo' | 'corpo' | 'pernaA' | 'pernaB' | 'anel' | 'olhos'> {
  const cor = /^#[0-9a-fA-F]{6}$/.test(ap.cor) ? ap.cor : '#2BB3A3';
  const base = mat(cor), sombra = mat(new THREE.Color(cor).multiplyScalar(0.7).getHex()), preto = mat('#1C2030');
  const grupo = new THREE.Group(), corpo = new THREE.Group(); grupo.add(corpo); grupo.userData.agente = true;
  caixa(corpo, 0.5, 0.5, 0.32, 0, 0.62, 0, base); caixa(corpo, 0.14, 0.34, 0.14, -0.33, 0.62, 0, sombra); caixa(corpo, 0.14, 0.34, 0.14, 0.33, 0.62, 0, sombra);
  const cabeca = new THREE.Group(); cabeca.position.y = 1.14; corpo.add(cabeca);
  if (ap.corpo === 'redondo') { const s = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), base); s.castShadow = true; cabeca.add(s); }
  else caixa(cabeca, 0.66, 0.5, 0.46, 0, 0, 0, base);
  caixa(cabeca, 0.5, 0.3, 0.04, 0, 0, ap.corpo === 'redondo' ? 0.3 : 0.235, preto, false);
  const olhos = mat('#7DF9FF', { emissive: new THREE.Color('#3BC8D4') });
  const zo = ap.corpo === 'redondo' ? 0.325 : 0.26;
  caixa(cabeca, 0.11, 0.11, 0.02, -0.12, 0.01, zo, olhos, false); caixa(cabeca, 0.11, 0.11, 0.02, 0.12, 0.01, zo, olhos, false);
  const antena = (x: number) => { caixa(cabeca, 0.04, 0.2, 0.04, x, 0.34, 0, preto, false); caixa(cabeca, 0.09, 0.09, 0.09, x, 0.47, 0, mat('#3DDC84', { emissive: new THREE.Color('#1E8F55') }), false); };
  if (ap.corpo === 'antenas') { antena(-0.18); antena(0.18); } else antena(0);
  if (ap.acessorio === 'gravata') caixa(corpo, 0.1, 0.3, 0.03, 0, 0.66, 0.17, mat('#D14646'), false);
  if (ap.acessorio === 'fone') { caixa(cabeca, 0.08, 0.26, 0.2, -0.38, 0, 0, preto, false); caixa(cabeca, 0.08, 0.26, 0.2, 0.38, 0, 0, preto, false); caixa(cabeca, 0.78, 0.05, 0.08, 0, 0.29, 0, preto, false); }
  if (ap.acessorio === 'bone') { caixa(cabeca, 0.7, 0.12, 0.5, 0, 0.31, 0, mat('#2D55F5'), false); caixa(cabeca, 0.5, 0.05, 0.3, 0, 0.27, 0.36, mat('#2D55F5'), false); }
  const perna = (x: number) => { const g = new THREE.BoxGeometry(0.17, 0.38, 0.17); g.translate(0, -0.19, 0); const p = new THREE.Mesh(g, sombra); p.position.set(x, 0.38, 0); p.castShadow = true; grupo.add(p); return p; };
  const pernaA = perna(-0.13), pernaB = perna(0.13);
  const anel = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 24), new THREE.MeshBasicMaterial({ color: '#8FA5FF', side: THREE.DoubleSide }));
  anel.rotation.x = -Math.PI / 2; anel.position.y = 0.02; anel.visible = false; grupo.add(anel);
  return { grupo, corpo, pernaA, pernaB, anel, olhos };
}

export class Mundo {
  scene = new THREE.Scene();
  private bonecos = new Map<string, Boneco>();
  private postos = new Map<number, Posto>();

  constructor() {
    this.scene.background = new THREE.Color('#0E1220');
    this.scene.add(new THREE.HemisphereLight('#FFFFFF', '#6A6480', 1.5));
    const sol = new THREE.DirectionalLight('#FFF3E0', 1.6);
    sol.position.set(8, 16, 10); sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
    Object.assign(sol.shadow.camera, { left: -14, right: 14, top: 12, bottom: -12, near: 1, far: 50 });
    this.scene.add(sol);
    montarSala(this.scene);
  }

  // Cria, atualiza e remove bonecos e mesas conforme a lista de agentes.
  sync(agentes: Agente[], ocupados: Set<string>, selecionado: string | null) {
    const vivos = new Set(agentes.map(a => a.id));
    for (const [id, b] of this.bonecos) if (!vivos.has(id)) { this.scene.remove(b.grupo); this.bonecos.delete(id); }
    const usados = new Set<number>();
    agentes.forEach((a, i) => {
      const slot = i % 12; usados.add(slot);
      if (!this.postos.has(slot)) this.postos.set(slot, montarPosto(this.scene, mesaDe(slot)));
      const chave = JSON.stringify(a.aparencia);
      let b = this.bonecos.get(a.id);
      if (!b || b.chave !== chave) {
        const antigo = b; if (antigo) this.scene.remove(antigo.grupo);
        const m = montarBoneco(a.aparencia), lar = casaDe(slot);
        m.grupo.position.set(antigo?.grupo.position.x ?? lar.x, 0, antigo?.grupo.position.z ?? lar.z);
        m.grupo.rotation.y = Math.PI; m.grupo.userData.id = a.id;
        b = { ...m, rota: antigo?.rota ?? [], espera: 1 + Math.random() * 4, ocupado: false, festa: 0, fase: Math.random() * 6, chave, indice: slot };
        this.bonecos.set(a.id, b); this.scene.add(m.grupo);
      }
      b.indice = slot;
      const ocupado = ocupados.has(a.id) && a.ativo;
      if (ocupado && !b.ocupado) b.rota = tracar({ x: b.grupo.position.x, z: b.grupo.position.z }, casaDe(slot));
      if (!ocupado && b.ocupado) { b.festa = 1.6; b.espera = 2.5; }
      b.ocupado = ocupado;
      b.anel.visible = selecionado === a.id;
      b.olhos.color.set(a.ativo ? '#7DF9FF' : '#4A5568'); b.olhos.emissive.set(a.ativo ? '#3BC8D4' : '#000000');
      b.grupo.userData.ativo = a.ativo;
    });
    for (const [slot, p] of this.postos) if (!usados.has(slot)) { this.scene.remove(p.grupo); this.postos.delete(slot); }
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
      const balanco = andando && !parado ? Math.sin(b.fase * 11) * 0.7 : 0;
      b.pernaA.rotation.x = balanco; b.pernaB.rotation.x = -balanco;
      b.corpo.position.y = parado ? 0 : andando ? Math.abs(Math.sin(b.fase * 11)) * 0.05 : naMesa ? Math.sin(b.fase * 9) * 0.02 : b.festa > 0 ? Math.abs(Math.sin(b.fase * 9)) * 0.35 : Math.sin(b.fase * 2) * 0.015;
    }
    for (const [slot, p] of this.postos) p.tela.emissive.set(ligadas.has(slot) ? (Math.sin(performance.now() / 160) > 0 ? '#2FBF6E' : '#1F8F52') : '#000000');
  }

  // Posição da etiqueta de cada agente, acima da cabeça.
  etiqueta(id: string, saida: THREE.Vector3): boolean {
    const b = this.bonecos.get(id); if (!b) return false;
    saida.set(b.grupo.position.x, 1.95 + b.corpo.position.y, b.grupo.position.z); return true;
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
    this.scene.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(mt)) mt.forEach(x => x.dispose()); else mt?.dispose(); });
  }
}
