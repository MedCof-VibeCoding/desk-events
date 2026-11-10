import { createClient } from '@supabase/supabase-js';
import type { Personagem, VersaoAvatar, LookAvatar } from './personagens';
import { ehPaginaConfirmacao } from './confirmacaoEmail';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configurado = Boolean(url && key);
export const supabase = createClient(url || 'https://nao-configurado.supabase.co', key || 'nao-configurado', {
  auth: { detectSessionInUrl: typeof window === 'undefined' || !ehPaginaConfirmacao(window.location.href) }
});

export type Papel = 'leitor' | 'operador' | 'editor' | 'dono';
export type Provedor = 'anthropic' | 'openai' | 'google';
export type Autonomia = 'assistido' | 'supervisionado' | 'autonomo' | 'livre';
export interface Aparencia { corpo: 'monitor' | 'redondo' | 'antenas'; cor: string; acessorio: null | 'gravata' | 'fone' | 'bone'; personagem?: Personagem | 'classico' | 'fotografo' | 'campeao' | 'pesquisador'; versao?: VersaoAvatar; look?: LookAvatar }
export interface Escritorio { id: string; nome: string; pausado: boolean }
export interface Agente {
  id: string; escritorio_id: string; nome: string; cargo: string; instrucoes: string;
  aparencia: Aparencia; provedor: Provedor; modelo: string; autonomia: Autonomia; ativo: boolean;
}
export const PAPEL_ORDEM: Papel[] = ['leitor', 'operador', 'editor', 'dono'];
export const pode = (meu: Papel | null, minimo: Papel) => !!meu && PAPEL_ORDEM.indexOf(meu) >= PAPEL_ORDEM.indexOf(minimo);

export type EstadoFicha = 'fila' | 'trabalhando' | 'aguardando_aprovacao' | 'entregue' | 'cancelada' | 'erro';
export interface Ficha { id: string; titulo: string; pedido: string; estado: EstadoFicha; resultado: string | null; agente_atual: string | null; criado_em: string }

const SERVER = ((import.meta.env.VITE_SERVER_URL as string | undefined) || 'https://desk-events-server.vercel.app').replace(/\/$/, '');

// Chama o servidor de agentes com a sessão de quem está logado.
export async function servidor<T>(caminho: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Faça login para continuar.');
  let res: Response;
  try {
    res = await fetch(SERVER + caminho, { ...init, headers: { ...(init?.headers || {}), authorization: `Bearer ${token}`, 'content-type': 'application/json' } });
  } catch { throw new Error('Não foi possível falar com o servidor de agentes.'); }
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((corpo as { erro?: string }).erro || `O servidor respondeu ${res.status}.`);
  return corpo as T;
}
