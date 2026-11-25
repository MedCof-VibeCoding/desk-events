import * as THREE from 'three';
import { ModelosAvatar, type AvatarMovel } from './avatar3d';
import type { PessoaPresente } from './social';
import type { Ponto } from './caminhosAmbiente';
import { avancarPasso } from './pixelMarcha';

interface Pessoa3D { grupo: THREE.Group; modelo?: AvatarMovel; chave: string; destino: THREE.Vector3; rota: THREE.Vector3[]; velocidade:number }
export class Pessoas3D {
  private pessoas = new Map<string, Pessoa3D>();
  private modelos = new ModelosAvatar();
  constructor(private scene: THREE.Scene, private caminho?: (de:Ponto,para:Ponto)=>Ponto[], private livre:(p:Ponto)=>Ponto=p=>p, private limitar:(de:Ponto,para:Ponto)=>Ponto=(_,para)=>para) {}
  recalcular() { if(this.caminho) for(const p of this.pessoas.values()) {const pos=this.livre(p.grupo.position);p.grupo.position.set(pos.x,0,pos.z);p.velocidade=0;p.rota=this.caminho(p.grupo.position,p.destino).map(q=>new THREE.Vector3(q.x,0,q.z));} }
  sync(lista: PessoaPresente[]) {
    const ids = new Set(lista.map(p => p.user_id));
    for (const [id, p] of this.pessoas) if (!ids.has(id)) { p.modelo?.destruir(); this.scene.remove(p.grupo); this.pessoas.delete(id); }
    for (const pessoa of lista) {
      const chave = JSON.stringify(pessoa.aparencia);
      let p = this.pessoas.get(pessoa.user_id);
      if (!p || p.chave !== chave) {
        const anterior = p;
        if (p) { p.modelo?.destruir(); this.scene.remove(p.grupo); }
        const grupo = new THREE.Group();
        grupo.userData.userId = pessoa.user_id;
        grupo.position.copy(anterior?.grupo.position ?? new THREE.Vector3(pessoa.x,0,pessoa.z)); grupo.rotation.y = anterior?.grupo.rotation.y ?? .6;
        const nascimento=this.livre(grupo.position);grupo.position.set(nascimento.x,0,nascimento.z);
        p = { grupo, chave, destino: anterior?.destino.clone() ?? new THREE.Vector3(pessoa.x, 0, pessoa.z), rota: anterior?.rota ?? [], velocidade:anterior?.velocidade??0 };
        this.pessoas.set(pessoa.user_id, p); this.scene.add(grupo);
        const atual = p;
        void this.modelos.criarAparencia(pessoa.aparencia).then(modelo => {
          if (!modelo) return;
          if (this.pessoas.get(pessoa.user_id) !== atual) { modelo.destruir(); return; }
          atual.modelo = modelo; atual.grupo.add(modelo.root);
        }).catch(() => { /* A lista de presentes continua acessível sem WebGL/modelo. */ });
      }
      if (p.destino.x !== pessoa.x || p.destino.z !== pessoa.z) {
        p.destino.set(pessoa.x, 0, pessoa.z);
        // Corredor lateral evita atravessar mesas ao ir do escritório ao café/reunião.
        const pos = p.grupo.position;
        p.rota = this.caminho ? this.caminho(pos,p.destino).map(q=>new THREE.Vector3(q.x,0,q.z)) : Math.abs(pos.z - pessoa.z) > 3
          ? [new THREE.Vector3(8.5, 0, pos.z), new THREE.Vector3(8.5, 0, pessoa.z), p.destino.clone()]
          : [p.destino.clone()];
      }
    }
  }
  passo(dt: number, parado: boolean) {
    for (const p of this.pessoas.values()) {
      let velocidade = 0;
      if (parado) { const seguro=this.livre(p.destino);p.grupo.position.set(seguro.x,0,seguro.z); p.rota = []; p.velocidade=0; }
      else if (p.modelo && p.rota.length && dt > 0) {
        const delta = p.rota[0].clone().sub(p.grupo.position), distancia = delta.length();
        const avancar=avancarPasso(p.velocidade,distancia,dt,1.1,p.rota.length===1),passo=avancar.distancia;p.velocidade=avancar.velocidade;
        if (distancia > 0) {
          const giro=Math.atan2(Math.sin(Math.atan2(delta.x,delta.z)-p.grupo.rotation.y),Math.cos(Math.atan2(delta.x,delta.z)-p.grupo.rotation.y));p.grupo.rotation.y+=giro*(1-Math.exp(-dt*12));
          const antes=p.grupo.position, desejado=antes.clone().addScaledVector(delta.normalize(),passo),seguro=this.limitar(antes,desejado);
          velocidade=Math.hypot(seguro.x-antes.x,seguro.z-antes.z)/dt;antes.set(seguro.x,0,seguro.z);
          if(Math.hypot(seguro.x-desejado.x,seguro.z-desejado.z)>.0001){p.rota=[];p.velocidade=0;}
          else if(distancia<=passo)p.rota.shift();
        } else p.rota.shift();
      }
      if(!p.rota.length)p.velocidade=0;
      p.modelo?.passo(dt, velocidade ? 'Walk' : 'Idle', parado, velocidade);
    }
  }
  etiqueta(id: string, saida: THREE.Vector3) { const p = this.pessoas.get(id); if (!p) return false; saida.copy(p.grupo.position); saida.y = 2.2; return true; }
  /** Pessoa sob o clique, com a distância até a câmera. */
  alvo(raio: THREE.Raycaster): { id: string; distancia: number } | null {
    const hits = raio.intersectObjects([...this.pessoas.values()].map(p => p.grupo), true);
    for (const h of hits) { let o: THREE.Object3D | null = h.object; while (o) { if (o.userData.userId) return { id: o.userData.userId as string, distancia: h.distance }; o = o.parent; } }
    return null;
  }
  destruir() { for (const p of this.pessoas.values()) { p.modelo?.destruir(); this.scene.remove(p.grupo); } this.pessoas.clear(); this.modelos.destruir(); }
}
