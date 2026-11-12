import * as THREE from 'three';
import { ModelosAvatar, type AvatarAnimado } from './avatar3d';
import { avatarDe } from './personagens';
import type { PessoaPresente } from './social';

interface Pessoa3D { grupo: THREE.Group; modelo?: AvatarAnimado; chave: string; destino: THREE.Vector3; rota: THREE.Vector3[] }
export class Pessoas3D {
  private pessoas = new Map<string, Pessoa3D>();
  private modelos = new ModelosAvatar();
  constructor(private scene: THREE.Scene) {}
  sync(lista: PessoaPresente[]) {
    const ids = new Set(lista.map(p => p.user_id));
    for (const [id, p] of this.pessoas) if (!ids.has(id)) { p.modelo?.destruir(); this.scene.remove(p.grupo); this.pessoas.delete(id); }
    for (const pessoa of lista) {
      const avatar = avatarDe(pessoa.aparencia), chave = avatar.id;
      let p = this.pessoas.get(pessoa.user_id);
      if (!p || p.chave !== chave) {
        if (p) { p.modelo?.destruir(); this.scene.remove(p.grupo); }
        const grupo = new THREE.Group(); grupo.position.set(pessoa.x, 0, pessoa.z); grupo.rotation.y = .6;
        p = { grupo, chave, destino: new THREE.Vector3(pessoa.x, 0, pessoa.z), rota: [] };
        this.pessoas.set(pessoa.user_id, p); this.scene.add(grupo);
        const atual = p;
        void this.modelos.criar(avatar.modelo).then(modelo => {
          if (!modelo) return;
          if (this.pessoas.get(pessoa.user_id) !== atual) { modelo.destruir(); return; }
          atual.modelo = modelo; atual.grupo.add(modelo.root);
        }).catch(() => { /* A lista de presentes continua acessível sem WebGL/modelo. */ });
      }
      if (p.destino.x !== pessoa.x || p.destino.z !== pessoa.z) {
        p.destino.set(pessoa.x, 0, pessoa.z);
        // Corredor lateral evita atravessar mesas ao ir do escritório ao café/reunião.
        const pos = p.grupo.position;
        p.rota = Math.abs(pos.z - pessoa.z) > 3
          ? [new THREE.Vector3(8.5, 0, pos.z), new THREE.Vector3(8.5, 0, pessoa.z), p.destino.clone()]
          : [p.destino.clone()];
      }
    }
  }
  passo(dt: number, parado: boolean) {
    for (const p of this.pessoas.values()) {
      let velocidade = 0;
      if (parado) { p.grupo.position.copy(p.destino); p.rota = []; }
      else if (p.modelo && p.rota.length && dt > 0) {
        const delta = p.rota[0].clone().sub(p.grupo.position), distancia = delta.length(), passo = Math.min(distancia, dt * 1.1);
        if (distancia > 0) { p.grupo.rotation.y = Math.atan2(delta.x, delta.z); p.grupo.position.addScaledVector(delta.normalize(), passo); velocidade = passo / dt; }
        if (distancia <= passo) p.rota.shift();
      }
      p.modelo?.passo(dt, velocidade ? 'Walk' : 'Idle', parado, velocidade);
    }
  }
  etiqueta(id: string, saida: THREE.Vector3) { const p = this.pessoas.get(id); if (!p) return false; saida.copy(p.grupo.position); saida.y = 2.2; return true; }
  destruir() { for (const p of this.pessoas.values()) { p.modelo?.destruir(); this.scene.remove(p.grupo); } this.pessoas.clear(); this.modelos.destruir(); }
}
