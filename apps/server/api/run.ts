import { admin, exigirPapel, falha, json, preflight, usuario, HttpError } from '../lib/core.js';
import { trabalhar } from '../lib/loop.js';
import { bancoStore } from '../lib/store.js';

export const OPTIONS = () => preflight();

// POST /api/run { fichaId } — o agente da ficha começa a trabalhar. A resposta sai quando
// a ficha é entregue, para numa aprovação ou falha.
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await usuario(request);
    const { fichaId } = (await request.json().catch(() => ({}))) as { fichaId?: string };
    if (!fichaId) throw new HttpError(400, 'Faltou informar a ficha.');
    const db = admin();
    const { data: ficha } = await db.from('fichas').select('id, escritorio_id').eq('id', fichaId).maybeSingle();
    if (!ficha) throw new HttpError(404, 'Ficha não encontrada.');
    await exigirPapel(user.id, ficha.escritorio_id, 'operador');
    // Só uma execução por ficha: quem conseguir tirar da fila é quem trabalha.
    const { data: pega } = await db.from('fichas').update({ estado: 'trabalhando' }).eq('id', ficha.id).eq('estado', 'fila').select('id');
    if (!pega?.length) throw new HttpError(409, 'Esta ficha já está sendo trabalhada ou foi concluída.');
    return json({ ok: true, ...(await trabalhar(bancoStore(), ficha.id)) });
  } catch (e) { return falha(e); }
}
