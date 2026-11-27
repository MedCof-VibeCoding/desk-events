import { supabase, type Papel } from './supabase';

export interface SalaVitrine {
  id: string;
  nome: string;
  dono_id: string;
  dono_nome: string;
  papel: Papel | null;
  pedido: 'pendente' | 'recusado' | null;
  pedidos_pendentes: number;
}
export interface PedidoVisita {
  id: string;
  escritorio_id: string;
  solicitante: string;
  nome: string;
  criado_em: string;
}

function funcaoAusente(error: { code?: string; message?: string }) {
  return error.code === 'PGRST202' || /could not find the function|schema cache/i.test(error.message ?? '');
}

/** Junta a lista local com a do diretório. A que chega por último prevalece no mesmo id. */
export function juntarVitrine(base: SalaVitrine[], chegando: SalaVitrine[]): SalaVitrine[] {
  const mapa = new Map(base.map(s => [s.id, s]));
  for (const s of chegando) {
    const antes = mapa.get(s.id);
    mapa.set(s.id, antes ? { ...antes, ...s, dono_nome: s.dono_nome || antes.dono_nome, papel: s.papel ?? antes.papel, pedido: s.pedido ?? antes.pedido } : s);
  }
  return [...mapa.values()];
}

/** Salas que o escritório já conseguiu ler, usadas quando o diretório novo ainda não está no banco. */
export function vitrineDeSalas(salas: { id: string; nome: string; criado_por: string; principal?: boolean; papel: Papel | null }[]): SalaVitrine[] {
  return salas.filter(s => !s.principal).map(s => ({
    id: s.id,
    nome: s.nome,
    dono_id: s.criado_por,
    dono_nome: s.nome.replace(/^Sala de\s+/i, '').trim() || s.nome,
    papel: s.papel,
    pedido: null,
    pedidos_pendentes: 0,
  }));
}

/** Salas não principais visíveis para quem está logado. */
async function listarVitrineDireta(): Promise<SalaVitrine[]> {
  const { data: sessao } = await supabase.auth.getUser();
  const eu = sessao.user?.id ?? null;
  const [salas, perfis, membros] = await Promise.all([
    supabase.from('escritorios').select('id,nome,criado_por,principal').eq('principal', false).order('nome'),
    supabase.from('perfis').select('user_id,nome'),
    eu ? supabase.from('membros').select('escritorio_id,papel').eq('user_id', eu) : Promise.resolve({ data: [] as { escritorio_id: string; papel: Papel }[], error: null }),
  ]);
  if (salas.error) throw new Error(salas.error.message);
  const nomes = new Map((perfis.data ?? []).map(p => [p.user_id as string, String(p.nome ?? '').trim()]));
  const papeis = new Map((membros.data ?? []).map(m => [m.escritorio_id as string, m.papel as Papel]));
  return (salas.data ?? []).filter(s => !s.principal).map(s => ({
    id: s.id as string,
    nome: s.nome as string,
    dono_id: s.criado_por as string,
    dono_nome: nomes.get(s.criado_por as string) || String(s.nome).replace(/^Sala de\s+/i, '').trim() || 'Sala',
    papel: papeis.get(s.id as string) ?? (s.criado_por === eu ? 'dono' : null),
    pedido: null,
    pedidos_pendentes: 0,
  }));
}

/** Salas pessoais que aparecem em volta do escritório principal. */
export async function listarVitrine(): Promise<SalaVitrine[]> {
  const { data, error } = await supabase.rpc('listar_salas_vitrine');
  if (!error) return (data ?? []) as SalaVitrine[];
  if (!funcaoAusente(error)) throw new Error(error.message);
  return listarVitrineDireta();
}

/** Pedidos ainda sem resposta na sala de quem está logado. */
export async function listarPedidos(): Promise<PedidoVisita[]> {
  const { data, error } = await supabase.rpc('listar_pedidos_visita');
  if (!error) return (data ?? []) as PedidoVisita[];
  if (funcaoAusente(error)) return [];
  throw new Error(error.message);
}

/** Pede autorização do dono para entrar na sala. */
export async function pedirVisita(sala: string): Promise<void> {
  const { error } = await supabase.rpc('pedir_visita', { sala });
  if (error) throw new Error(error.message);
}

/** O dono aceita a visita como leitor ou recusa o pedido. */
export async function decidirVisita(pedido: string, aceitar: boolean): Promise<void> {
  const { error } = await supabase.rpc('decidir_visita', { pedido, aceitar });
  if (error) throw new Error(error.message);
}
