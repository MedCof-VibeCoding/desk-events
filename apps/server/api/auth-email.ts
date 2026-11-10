import { configuracaoEmail, EmailError, enviarAuthEmail, verificarAssinatura } from '../lib/auth-email.js';

const headers = { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' };
const falha = (status: number, message: string) => new Response(JSON.stringify({ error: { http_code: status, message } }), { status, headers });

// Chamado pelo Send Email Hook do Supabase; não é um endpoint público de envio livre.
export async function POST(request: Request): Promise<Response> {
  try {
    const config = configuracaoEmail();
    if (!request.headers.get('webhook-signature')) return falha(401, 'Assinatura inválida.');
    if (Number(request.headers.get('content-length') || 0) > 65536) return falha(413, 'Mensagem muito grande.');
    const reader = request.body?.getReader();
    if (!reader) return falha(400, 'Mensagem inválida.');
    const chunks: Uint8Array[] = []; let tamanho = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      tamanho += value.byteLength;
      if (tamanho > 65536) { await reader.cancel(); return falha(413, 'Mensagem muito grande.'); }
      chunks.push(value);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    verificarAssinatura(raw, request.headers, config.secret);
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return falha(400, 'Mensagem inválida.'); }
    await enviarAuthEmail(payload, config);
    return new Response('{}', { status: 200, headers });
  } catch (e) {
    const erro = e instanceof EmailError ? e : new EmailError(500, 'email_internal_error');
    // Não registrar destinatários, tokens, corpo, chave ou resposta bruta do provedor.
    console.warn('auth-email', erro.code);
    return falha(erro.status, erro.status === 401 ? 'Assinatura inválida.' : 'Não foi possível enviar o e-mail. Tente novamente em instantes.');
  }
}
