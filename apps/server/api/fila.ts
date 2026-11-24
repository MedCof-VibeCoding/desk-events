import { timingSafeEqual } from 'node:crypto';
import { admin, falha, json, HttpError } from '../lib/core.js';
import { emSegundoPlano, processar } from '../lib/fila.js';

// POST /api/fila — chamado pelo despertador do banco (1 em 1 minuto e quando a ponte responde)
// e pelo próprio servidor para continuar fichas longas. Protegido pelo CRON_SECRET.
function autorizado(request: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  const recebido = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!segredo || !recebido) return false;
  const a = Buffer.from(segredo), b = Buffer.from(recebido);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function atender(request: Request): Promise<Response> {
  try {
    if (!autorizado(request)) throw new HttpError(401, 'Não autorizado.');
    // Pedido para a ponte sem resposta há 10 minutos: encerra com erro, e a ficha retoma sem ele.
    await admin().from('tarefas_locais').update({ estado: 'erro', resultado: 'A ponte local não respondeu em 10 minutos.' })
      .in('estado', ['pendente', 'executando']).lt('criado_em', new Date(Date.now() - 10 * 60_000).toISOString());
    emSegundoPlano(processar({ limite: 5 }));
    return json({ ok: true }, 202);
  } catch (e) { return falha(e); }
}

export const POST = atender;
export const GET = atender;
