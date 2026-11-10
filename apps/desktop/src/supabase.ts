import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configurado = Boolean(url && key);
export const supabase = createClient(url || 'https://nao-configurado.supabase.co', key || 'nao-configurado');

export type Papel = 'leitor' | 'operador' | 'editor' | 'dono';
export type Provedor = 'anthropic' | 'openai' | 'google';
export type Autonomia = 'assistido' | 'supervisionado' | 'autonomo' | 'livre';
export interface Aparencia { corpo: 'monitor' | 'redondo' | 'antenas'; cor: string; acessorio: null | 'gravata' | 'fone' | 'bone' }
export interface Escritorio { id: string; nome: string; pausado: boolean }
export interface Agente {
  id: string; escritorio_id: string; nome: string; cargo: string; instrucoes: string;
  aparencia: Aparencia; provedor: Provedor; modelo: string; autonomia: Autonomia; ativo: boolean;
}
export const PAPEL_ORDEM: Papel[] = ['leitor', 'operador', 'editor', 'dono'];
export const pode = (meu: Papel | null, minimo: Papel) => !!meu && PAPEL_ORDEM.indexOf(meu) >= PAPEL_ORDEM.indexOf(minimo);
