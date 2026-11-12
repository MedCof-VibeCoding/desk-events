import type { Aparencia, Papel } from './supabase';

export type Zona = 'geral' | 'reuniao' | 'cafe';
export interface Perfil { user_id: string; nome: string; aparencia: Aparencia | null; admin_geral: boolean }
export interface PessoaPresente { user_id: string; nome: string; aparencia: Aparencia; zona: Zona; x: number; z: number; visto_em: string }
export interface MensagemCafe { id: string; user_id: string; destinatario: string | null; texto: string; criado_em: string }
export interface SalaAcesso { id: string; nome: string; pausado: boolean; principal: boolean; criado_por: string; papel: Papel }
export const PRESENCA_VALIDA_MS = 70_000;
export const BALAO_MS = 12_000;
export function presentesAtivos(pessoas: PessoaPresente[], agora = Date.now()) {
  return pessoas.filter(p => Number.isFinite(Date.parse(p.visto_em)) && agora - Date.parse(p.visto_em) < PRESENCA_VALIDA_MS);
}
export function baloesAtivos(mensagens: MensagemCafe[], pessoas: PessoaPresente[], agora = Date.now()) {
  const cafe = new Set(pessoas.filter(p => p.zona === 'cafe').map(p => p.user_id));
  const resultado: Record<string, MensagemCafe> = {};
  for (const m of mensagens) if (cafe.has(m.user_id) && agora - Date.parse(m.criado_em) < BALAO_MS) resultado[m.user_id] = m;
  return resultado;
}
