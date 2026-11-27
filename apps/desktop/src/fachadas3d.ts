import * as THREE from 'three';
import { bloco, grupo } from './mobilia3d';

export interface FachadaInfo { id: string; minha: boolean; pendentes: number }
const PASSO = 3.5;

interface Anel { minX: number; maxX: number; minZ: number; maxZ: number; norte: number; sul: number; oeste: number; leste: number }

/** Retângulo de fachadas ao redor do escritório principal. Anéis seguintes ficam mais afastados. */
function anelDe(anel: number): Anel {
  const folga = 3.1 + anel * 3.8;
  const minX = -10.8 - folga, maxX = 10.8 + folga, minZ = -8 - folga, maxZ = 8.3 + folga;
  const norte = Math.max(2, Math.floor((maxX - minX) / PASSO));
  const oeste = Math.max(2, Math.floor((maxZ - minZ) / PASSO));
  return { minX, maxX, minZ, maxZ, norte, sul: norte, oeste, leste: oeste };
}

/** Posição no chão da fachada de índice, contando a partir do anel mais próximo. */
export function lugarFachada(indice: number): { x: number; z: number } {
  let restante = Math.max(0, indice), anel = 0;
  for (;;) {
    const b = anelDe(anel);
    const capacidade = b.norte + b.leste + b.sul + b.oeste;
    if (restante < capacidade) return lugarNoAnel(b, restante);
    restante -= capacidade;
    anel++;
  }
}

/** Quantos anéis são necessários para exibir todas as salas. */
export function anelFachadas(quantidade: number): number {
  let restante = quantidade, anel = 0;
  while (restante > 0) {
    const b = anelDe(anel);
    const capacidade = b.norte + b.leste + b.sul + b.oeste;
    if (restante <= capacidade) return anel;
    restante -= capacidade;
    anel++;
  }
  return 0;
}

function lugarNoAnel(b: Anel, indice: number): { x: number; z: number } {
  let i = indice;
  if (i < b.norte) {
    const t = (i + .5) / b.norte;
    return { x: b.minX + t * (b.maxX - b.minX), z: b.minZ };
  }
  i -= b.norte;
  if (i < b.leste) {
    const t = (i + .5) / b.leste;
    return { x: b.maxX, z: b.minZ + t * (b.maxZ - b.minZ) };
  }
  i -= b.leste;
  if (i < b.sul) {
    const t = (i + .5) / b.sul;
    return { x: b.maxX - t * (b.maxX - b.minX), z: b.maxZ };
  }
  i -= b.sul;
  const t = (i + .5) / b.oeste;
  return { x: b.minX, z: b.maxZ - t * (b.maxZ - b.minZ) };
}

/** Casinhas clicáveis. A porta aponta para o escritório. */
export function montarFachadas(salas: FachadaInfo[]): { grupo: THREE.Group; pontos: Map<string, THREE.Vector3> } {
  const raiz = new THREE.Group();
  raiz.name = 'fachadas';
  const pontos = new Map<string, THREE.Vector3>();
  const parede = new THREE.MeshLambertMaterial({ color: '#3c342c' });
  const telhado = new THREE.MeshLambertMaterial({ color: '#1b1c1f' });
  const telhadoMeu = new THREE.MeshLambertMaterial({ color: '#8d4a32' });
  const porta = new THREE.MeshLambertMaterial({ color: '#c4554a' });
  const vidro = new THREE.MeshLambertMaterial({ color: '#91adb0' });
  const aviso = new THREE.MeshLambertMaterial({ color: '#e24b4b', emissive: new THREE.Color('#6a1010') });
  salas.forEach((s, i) => {
    const p = lugarFachada(i);
    const g = grupo(raiz, `fachada-${s.id}`, p.x, p.z);
    g.userData.salaId = s.id;
    bloco(g, 2.7, .16, 2.3, 0, .08, 0, parede);
    bloco(g, 2.5, 1.7, 2.05, 0, 1.05, 0, parede, .04);
    bloco(g, 2.7, .16, 2.3, 0, 1.95, 0, s.minha ? telhadoMeu : telhado);
    const len = Math.hypot(p.x, p.z) || 1, ux = -p.x / len, uz = -p.z / len, lateral = Math.abs(ux) > Math.abs(uz);
    bloco(g, lateral ? .08 : .7, 1.15, lateral ? .7 : .08, ux * 1.08, .85, uz * 1.08, porta);
    bloco(g, lateral ? .05 : .55, .4, lateral ? .55 : .05, ux * 1.02, 1.45, uz * 1.02, vidro, 0, false);
    if (s.pendentes > 0) bloco(g, .28, .28, .28, 0, 2.25, 0, aviso);
    pontos.set(s.id, new THREE.Vector3(p.x, 2.55, p.z));
  });
  return { grupo: raiz, pontos };
}
