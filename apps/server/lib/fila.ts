import { waitUntil } from '@vercel/functions';
import { admin, HttpError } from './core.js';
import { trabalhar } from './loop.js';
import { bancoStore } from './store.js';

// Tempo de trabalho por execução. A Vercel encerra a função em 300 s; sobra folga para a
// última chamada ao modelo (até 90 s) e para salvar. Depois disso a ficha volta para a fila
// e outra execução continua de onde parou.
export const ORCAMENTO_MS = 180_000;

// Endereço deste servidor, para uma execução acordar a próxima.
function urlFila(): string | null {
  const base = process.env.SERVIDOR_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  return base ? `${base.replace(/\/$/, '')}/api/fila` : null;
}

// Pede ao servidor uma nova execução da fila. Se falhar, o despertador do banco (1 min) cobre.
export async function acordar(): Promise<void> {
  const url = urlFila(), segredo = process.env.CRON_SECRET;
  if (!url || !segredo) return;
  try { await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${segredo}` }, signal: AbortSignal.timeout(5000) }); }
  catch { /* o despertador do banco pega na próxima volta */ }
}

// Trabalha numa ficha já reservada. Devolve true se ela voltou para a fila para continuar.
async function rodarUma(id: string): Promise<boolean> {
  try {
    const r = await trabalhar(bancoStore(), id, { prazo: Date.now() + ORCAMENTO_MS });
    return r.estado === 'fila';
  } catch (e) {
    const motivo = e instanceof HttpError ? e.message : 'Erro inesperado no servidor de agentes.';
    if (!(e instanceof HttpError)) console.error('fila', id, e);
    // Erros do modelo já foram gravados pelo ciclo; aqui ficam os demais (agente apagado, banco fora etc.).
    await admin().from('fichas').update({ estado: 'erro', resultado: motivo, trabalhando_ate: null }).eq('id', id).eq('estado', 'trabalhando');
    return false;
  }
}

// Pega fichas da fila (ou só uma) e trabalha nelas em paralelo.
export async function processar(opcoes: { so?: string; limite?: number } = {}): Promise<number> {
  const { data, error } = await admin().rpc('pegar_fichas', { limite: opcoes.limite ?? 3, so: opcoes.so ?? null });
  if (error) { console.error('pegar_fichas', error.message); return 0; }
  const ids = ((data ?? []) as { id: string }[]).map(l => l.id);
  const continuar = await Promise.all(ids.map(rodarUma));
  if (continuar.some(Boolean)) await acordar();
  return ids.length;
}

// Responde agora e continua o trabalho depois da resposta (na Vercel, até o fim do tempo da função).
export function emSegundoPlano(trabalho: Promise<unknown>): void {
  waitUntil(trabalho.catch(e => console.error('segundo plano', e)));
}
