import { createHmac, timingSafeEqual } from 'node:crypto';

export class EmailError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
const emailValido = (s: unknown): s is string => typeof s === 'string' && s.length <= 254 && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(s);
const texto = (s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 2048;
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function configuracaoEmail(env: NodeJS.ProcessEnv = process.env) {
  const key = env.SENDGRID_API_KEY?.trim(), from = env.SENDGRID_FROM_EMAIL?.trim();
  const secret = env.SEND_EMAIL_HOOK_SECRET?.trim();
  if (!key || !emailValido(from) || !secret) throw new EmailError(503, 'email_not_configured');
  let app: URL, supabase: URL;
  try { app = new URL(env.APP_URL || 'https://desk-events.vercel.app'); supabase = new URL(env.SUPABASE_URL || ''); }
  catch { throw new EmailError(503, 'email_not_configured'); }
  if ([app, supabase].some(u => u.protocol !== 'https:' || u.username || u.password)) throw new EmailError(503, 'email_not_configured');
  const name = env.SENDGRID_FROM_NAME?.trim() || 'Desk Events';
  if (name.length > 80 || /[\r\n]/.test(name)) throw new EmailError(503, 'email_not_configured');
  return { key, from, secret, name, app: app.origin, supabase: supabase.origin };
}
type Config = ReturnType<typeof configuracaoEmail>;

// Standard Webhooks v1: corpo original, id e timestamp assinados com HMAC-SHA256.
export function verificarAssinatura(raw: string, headers: Headers, secret: string, agora = Date.now()) {
  const chave = secret.replace(/^v1,/, '').replace(/^whsec_/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(chave) || Buffer.from(chave, 'base64').length < 32) throw new EmailError(503, 'email_not_configured');
  const id = headers.get('webhook-id'), tempo = headers.get('webhook-timestamp'), assinaturas = headers.get('webhook-signature');
  if (!id || id.length > 256 || !tempo || !/^\d+$/.test(tempo) || !assinaturas || assinaturas.length > 4096 || Math.abs(agora / 1000 - Number(tempo)) > 300)
    throw new EmailError(401, 'invalid_signature');
  const esperado = createHmac('sha256', Buffer.from(chave, 'base64')).update(`${id}.${tempo}.${raw}`).digest();
  const valido = assinaturas.split(/\s+/).some(s => {
    const [versao, valor] = s.split(',');
    if (versao !== 'v1' || !valor || !/^[A-Za-z0-9+/]+={0,2}$/.test(valor)) return false;
    const assinatura = Buffer.from(valor, 'base64');
    return assinatura.length === esperado.length && timingSafeEqual(assinatura, esperado);
  });
  if (!valido) throw new EmailError(401, 'invalid_signature');
}

type Mensagem = { para: string; assunto: string; titulo: string; descricao: string; link?: string; botao?: string; codigo?: string };
export function mensagensAuth(payload: unknown, config: Config): Mensagem[] {
  if (!payload || typeof payload !== 'object') throw new EmailError(400, 'invalid_payload');
  const { user, email_data: d } = payload as { user?: Record<string, unknown>; email_data?: Record<string, unknown> };
  if (!user || !d || !emailValido(user.email)) throw new EmailError(400, 'invalid_payload');
  const tipo = d.email_action_type;
  function link(hash: unknown, action: string) {
    if (!texto(hash)) throw new EmailError(400, 'invalid_payload');
    if (action === 'signup') {
      const u = new URL('/confirmar-email', config.app); u.searchParams.set('token_hash', hash); u.searchParams.set('type', 'email'); return u.href;
    }
    const u = new URL('/auth/v1/verify', config.supabase);
    u.searchParams.set('token', hash); u.searchParams.set('type', action);
    let retorno = config.app + '/';
    try { const destino = new URL(String(d!.redirect_to)); if (destino.origin === config.app && !destino.username && !destino.password) retorno = destino.href; } catch { /* Usa a origem configurada. */ }
    u.searchParams.set('redirect_to', retorno); return u.href;
  }
  const comum = { para: user.email, assunto: 'Confirme seu e-mail — Desk Events', titulo: 'Seu escritório está quase pronto.', descricao: 'Confirme seu e-mail para começar a organizar sua equipe de agentes no Desk Events.', botao: 'Confirmar meu e-mail' };
  if (tipo === 'signup') return [{ ...comum, link: link(d.token_hash, 'signup') }];
  if (tipo === 'reauthentication') {
    if (typeof d.token !== 'string' || !/^\d{6,10}$/.test(d.token)) throw new EmailError(400, 'invalid_payload');
    return [{ ...comum, assunto: 'Código de segurança — Desk Events', titulo: 'Confirme que é você.', descricao: 'Use este código para continuar sua operação. Não compartilhe com ninguém.', codigo: d.token }];
  }
  if (tipo === 'email_change') {
    if (!emailValido(user.new_email)) throw new EmailError(400, 'invalid_payload');
    const modelo = { ...comum, assunto: 'Confirme a alteração de e-mail — Desk Events', titulo: 'Confirme seu novo e-mail.', descricao: 'Você solicitou uma alteração no e-mail da sua conta.', botao: 'Confirmar alteração' };
    const mensagens = [{ ...modelo, para: user.new_email, link: link(d.token_hash, tipo) }];
    // Os nomes dos hashes são invertidos no contrato do Supabase.
    if (texto(d.token_hash_new)) mensagens.unshift({ ...modelo, para: user.email, link: link(d.token_hash_new, tipo) });
    return mensagens;
  }
  const outros = {
    recovery: { assunto: 'Redefina sua senha — Desk Events', titulo: 'Vamos recuperar seu acesso.', descricao: 'Use o botão abaixo para redefinir sua senha.', botao: 'Redefinir senha' },
    magiclink: { assunto: 'Seu link de acesso — Desk Events', titulo: 'Entre no seu escritório.', descricao: 'Use este link para acessar sua conta.', botao: 'Entrar no escritório' },
    invite: { assunto: 'Você foi convidado — Desk Events', titulo: 'Seu time espera por você.', descricao: 'Aceite o convite para começar a usar o Desk Events.', botao: 'Aceitar convite' }
  };
  if (typeof tipo === 'string' && Object.hasOwn(outros, tipo)) return [{ ...comum, ...outros[tipo as keyof typeof outros], link: link(d.token_hash, tipo) }];
  throw new EmailError(400, 'unsupported_email_type');
}

export function corpoSendGrid(m: Mensagem, config: Config) {
  const acao = m.link ? `<p style="margin:30px 0"><a href="${escapeHtml(m.link)}" style="display:inline-block;background:#c52232;border-radius:8px;color:#fff;text-decoration:none;padding:15px 22px;font-weight:bold">${escapeHtml(m.botao!)}</a></p>` : `<p style="font-size:32px;letter-spacing:5px;font-weight:bold">${escapeHtml(m.codigo!)}</p>`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#000;color:#f5f5f5;font-family:Arial,sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:40px 16px"><table role="presentation" width="480" style="max-width:100%;background:#0c0c0c;border:1px solid #303030;border-radius:20px"><tr><td style="padding:36px"><p style="font-size:24px"><strong>desk</strong>events</p><h1 style="font-size:28px">${escapeHtml(m.titulo)}</h1><p style="color:#ababab;line-height:1.7">${escapeHtml(m.descricao)}</p>${acao}<p style="color:#ababab;font-size:12px">Se você não solicitou esta ação, ignore esta mensagem.</p><p style="border-top:1px solid #303030;padding-top:20px;color:#ababab;font-size:12px">Seu time conectado. Seu trabalho em movimento.</p></td></tr></table></td></tr></table></body></html>`;
  return {
    personalizations: [{ to: [{ email: m.para }] }], from: { email: config.from, name: config.name }, subject: m.assunto,
    content: [{ type: 'text/plain', value: `${m.titulo}\n\n${m.descricao}\n\n${m.link || m.codigo}\n\nSe você não solicitou esta ação, ignore esta mensagem.` }, { type: 'text/html', value: html }],
    tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false }, subscription_tracking: { enable: false } }
  };
}

export async function enviarAuthEmail(payload: unknown, config: Config, enviar: typeof fetch = fetch) {
  const mensagens = mensagensAuth(payload, config);
  await Promise.all(mensagens.map(async m => {
    let resposta: Response;
    try {
      resposta = await enviar('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST', headers: { authorization: `Bearer ${config.key}`, 'content-type': 'application/json' },
        body: JSON.stringify(corpoSendGrid(m, config)), signal: AbortSignal.timeout(3500)
      });
    } catch { throw new EmailError(502, 'email_provider_unavailable'); }
    // 202 significa aceito para envio; não comprova a chegada à caixa de entrada.
    if (resposta.status !== 202) throw new EmailError(resposta.status === 429 ? 429 : 502, 'email_provider_rejected');
  }));
}
