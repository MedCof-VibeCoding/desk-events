import { HttpError, admin, falha, json, preflight } from '../lib/core.js';
import { configuracaoEmail, enviarAuthEmail } from '../lib/auth-email.js';

export const OPTIONS = () => preflight();

const emailValido = (s: string) => s.length <= 254 && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(s);

// Cria a conta sem passar pelo limite de e-mail do cadastro público e envia a confirmação pelo SendGrid.
export async function POST(request: Request): Promise<Response> {
  try {
    const corpo = await request.json().catch(() => null) as { email?: unknown; password?: unknown } | null;
    const email = typeof corpo?.email === 'string' ? corpo.email.trim().toLowerCase() : '';
    const password = typeof corpo?.password === 'string' ? corpo.password : '';
    if (!emailValido(email)) throw new HttpError(400, 'Informe um e-mail válido.');
    if (password.length < 8 || password.length > 72) throw new HttpError(400, 'A senha precisa ter entre 8 e 72 caracteres.');
    let config;
    try { config = configuracaoEmail(); }
    catch { throw new HttpError(503, 'O envio de e-mail ainda não está configurado. Avise quem administra o DeskCof.'); }
    const redirectTo = `${config.app}/confirmar-email`;
    const { data, error } = await admin().auth.admin.generateLink({ type: 'signup', email, password, options: { redirectTo } });
    if (error || !data.properties?.hashed_token) {
      const ja = /already|registered|exists/i.test(error?.message ?? '');
      throw new HttpError(ja ? 409 : 400, ja ? 'Já existe uma conta com esse e-mail. Entre ou confirme o link enviado.' : 'Não foi possível criar a conta. Tente novamente.');
    }
    try {
      await enviarAuthEmail({ user: { email }, email_data: { email_action_type: 'signup', token_hash: data.properties.hashed_token, redirect_to: redirectTo } }, config);
    } catch {
      if (data.user?.id && !data.user.email_confirmed_at) await admin().auth.admin.deleteUser(data.user.id);
      throw new HttpError(502, 'Não foi possível enviar o e-mail de confirmação. Tente novamente em instantes.');
    }
    return json({ ok: true });
  } catch (e) { return falha(e); }
}
