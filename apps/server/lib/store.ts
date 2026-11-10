import { admin } from './core.js';
import type { AgenteRow, AprovacaoRow, FichaRow, PassoRow, Store } from './loop.js';

const AGENTE = 'id, nome, cargo, instrucoes, provedor, modelo, autonomia, max_passos, ativo';

// O banco de verdade (Supabase), usado pelo ciclo do agente.
export function bancoStore(): Store {
  const db = admin();
  return {
    async ficha(id) { const { data } = await db.from('fichas').select('id, escritorio_id, pedido, estado, agente_atual').eq('id', id).maybeSingle(); return data as FichaRow | null; },
    async agente(id) { const { data } = await db.from('agentes').select(AGENTE).eq('id', id).maybeSingle(); return data as AgenteRow | null; },
    async colegas(esc) { const { data } = await db.from('agentes').select(AGENTE).eq('escritorio_id', esc).order('criado_em'); return (data ?? []) as AgenteRow[]; },
    async pausado(esc) { const { data } = await db.from('escritorios').select('pausado').eq('id', esc).maybeSingle(); return Boolean(data?.pausado); },
    async passos(fichaId) { const { data } = await db.from('passos').select('tipo, agente_id, conteudo').eq('ficha_id', fichaId).order('id'); return (data ?? []) as PassoRow[]; },
    async addPasso(f, agenteId, tipo, conteudo, tokens) {
      const { error } = await db.from('passos').insert({ ficha_id: f.id, escritorio_id: f.escritorio_id, agente_id: agenteId, tipo, conteudo, tokens_entrada: tokens?.e ?? 0, tokens_saida: tokens?.s ?? 0 });
      if (error) throw new Error(error.message);
    },
    async setFicha(id, patch) { const { error } = await db.from('fichas').update(patch).eq('id', id); if (error) throw new Error(error.message); },
    async aprovacoes(fichaId) { const { data } = await db.from('aprovacoes').select('id, estado, comentario, pedido').eq('ficha_id', fichaId); return (data ?? []) as AprovacaoRow[]; },
    async addAprovacao(f, agenteId, pedido) {
      const { error } = await db.from('aprovacoes').insert({ ficha_id: f.id, escritorio_id: f.escritorio_id, agente_id: agenteId, pedido });
      if (error) throw new Error(error.message);
    }
  };
}
