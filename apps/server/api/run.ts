import { admin, exigirPapel, falha, json, preflight, usuario, HttpError } from '../lib/core.js';
import { emSegundoPlano, processar } from '../lib/fila.js';

export const OPTIONS = () => preflight();

// POST /api/run { fichaId } — o agente da ficha começa a trabalhar em segundo plano.
// A resposta sai na hora; o site acompanha a ficha ao vivo pelo banco.
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await usuario(request);
    const { fichaId } = (await request.json().catch(() => ({}))) as { fichaId?: string };
    if (!fichaId) throw new HttpError(400, 'Faltou informar a ficha.');
    const db = admin();
    const { data: ficha } = await db.from('fichas').select('id, escritorio_id, estado').eq('id', fichaId).maybeSingle();
    if (!ficha) throw new HttpError(404, 'Ficha não encontrada.');
    await exigirPapel(user.id, ficha.escritorio_id, 'operador');
    if (ficha.estado !== 'fila') throw new HttpError(409, 'Esta ficha já está sendo trabalhada ou foi concluída.');
    // A reserva (pegar_fichas) garante uma execução por ficha, mesmo com o despertador rodando junto.
    emSegundoPlano(processar({ so: ficha.id, limite: 1 }));
    return json({ ok: true, estado: 'fila' }, 202);
  } catch (e) { return falha(e); }
}
