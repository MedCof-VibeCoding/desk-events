import type { Aparencia } from './supabase';

export const PERSONAGENS = [
  { id: 'atlas', nome: 'Atlas', cargo: 'Produção' },
  { id: 'pixel', nome: 'Pixel', cargo: 'Criação' },
  { id: 'ritmo', nome: 'Ritmo', cargo: 'Operação' },
  { id: 'foco', nome: 'Foco', cargo: 'Planejamento' },
  { id: 'elo', nome: 'Elo', cargo: 'Recepção' },
  { id: 'byte', nome: 'Byte', cargo: 'Tecnologia' }
].map(p => ({ ...p, imagem: `/avatars/${p.id}-m-casual.png`, proporcao: 1 }));

export type Personagem = 'atlas' | 'pixel' | 'ritmo' | 'foco' | 'elo' | 'byte';
export type VersaoAvatar = 'm' | 'f';
export type LookAvatar = 'casual' | 'escritorio' | 'evento';
export const LOOKS = [{ id: 'casual', nome: 'Casual' }, { id: 'escritorio', nome: 'Escritório' }, { id: 'evento', nome: 'Evento' }] as const;

export function personagemDe(aparencia: Aparencia) {
  return PERSONAGENS.find(p => p.id === aparencia.personagem) ?? PERSONAGENS[0];
}

export function avatarDe(aparencia: Aparencia) {
  const personagem = personagemDe(aparencia);
  const versao: VersaoAvatar = aparencia.versao === 'f' ? 'f' : 'm';
  const look: LookAvatar = LOOKS.some(l => l.id === aparencia.look) ? aparencia.look! : 'casual';
  const id = `${personagem.id}-${versao}-${look}`;
  return { ...personagem, id, personagem: personagem.id as Personagem, versao, look, modelo: `/avatars/${id}.glb`, imagem: `/avatars/${id}.png` };
}

export function normalizarAparencia(aparencia: Aparencia): Aparencia {
  const avatar = avatarDe(aparencia);
  return { ...aparencia, personagem: avatar.personagem, versao: avatar.versao, look: avatar.look };
}

