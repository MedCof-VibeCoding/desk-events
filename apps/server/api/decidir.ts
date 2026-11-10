import { admin, exigirPapel, falha, json, preflight, usuario, HttpError } from '../lib/core.js';
import { trabalhar } from '../lib/loop.js';
import { bancoStore } from '../lib/store.js';
import { SO_O_DONO } from '../lib/tools.js';

export const OPTIONS = () => preflight();

// POST /api/decidir { aprovacaoId, decisao: 'aprovada' | 'recusada', comentario? }
// Registra a decisão de uma pessoa e faz o agente continuar de onde parou.
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await usuario(request);
    const corpo = (await request.json().catch(() => ({}))) as { aprovacaoId?: string; decisao?: string; comentario?: string };
    if (!corpo.aprovacaoId || (corpo.decisao !== 'aprovada' && corpo.decisao !== 'recusada')) throw new HttpError(400, 'Decisão inválida.');
    const db = admin();
    const { data: ap } = await db.from('aprovacoes').select('id, ficha_id, escritorio_id, estado, pedido').eq('id', corpo.aprovacaoId).maybeSingle();
    if (!ap) throw new HttpError(404, 'Pedido de aprovação não encontrado.');
    await exigirPapel(user.id, ap.escritorio_id, 'operador');
    // Ação no computador de alguém: só essa pessoa aprova. Recusar, qualquer operador pode.
    if (corpo.decisao === 'aprovada' && SO_O_DONO.has(String((ap.pedido as { ferramenta?: string } | null)?.ferramenta))) {
      const { data: f } = await db.from('fichas').select('criado_por').eq('id', ap.ficha_id).maybeSingle();
      if (f?.criado_por !== user.id) throw new HttpError(403, 'Essa ação acontece no computador de quem criou a ficha. Só essa pessoa pode aprovar.');
    }
    const { data: feita } = await db.from('aprovacoes')
      .update({ estado: corpo.decisao, comentario: (corpo.comentario || '').trim().slice(0, 600) || null, decidido_por: user.id, decidido_em: new Date().toISOString() })
      .eq('id', ap.id).eq('estado', 'pendente').select('id');
    if (!feita?.length) throw new HttpError(409, 'Esse pedido já foi decidido por outra pessoa.');
    const { data: pega } = await db.from('fichas').update({ estado: 'trabalhando' }).eq('id', ap.ficha_id).eq('estado', 'aguardando_aprovacao').select('id');
    if (!pega?.length) return json({ ok: true, estado: 'decidido' });
    return json({ ok: true, ...(await trabalhar(bancoStore(), ap.ficha_id)) });
  } catch (e) { return falha(e); }
}
