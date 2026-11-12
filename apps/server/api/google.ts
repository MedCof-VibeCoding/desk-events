import { randomBytes } from 'node:crypto';
import { admin, falha, HttpError, json, preflight, usuario } from '../lib/core.js';
import { configuracaoGoogle, GOOGLE_SCOPE, googleFetch, hashEstado, protegerToken, abrirToken } from '../lib/google-agenda.js';
export const OPTIONS = () => preflight();
export async function GET(request: Request) {
  try {
    const user = await usuario(request);
    const { data, error } = await admin().from('google_conexoes').select('email').eq('user_id', user.id).maybeSingle();
    if (error) throw new HttpError(503, 'A integração Google precisa ser atualizada no servidor.');
    let configurado = true; try { configuracaoGoogle(); } catch { configurado = false; }
    return json({ conectado: !!data, email: data?.email ?? null, configurado });
  } catch (e) { return falha(e); }
}
export async function POST(request: Request) {
  try {
    const user = await usuario(request), db = admin();
    const body = await request.json();
    if (body.acao === 'desconectar') {
      const { data } = await db.from('google_conexoes').select('refresh_token').eq('user_id', user.id).maybeSingle();
      if (data) {
        const res = await googleFetch('https://oauth2.googleapis.com/revoke', { method: 'POST', body: new URLSearchParams({ token: abrirToken(data.refresh_token) }) });
        if (!res.ok && res.status !== 400) throw new HttpError(502, 'Não foi possível revogar a autorização Google. Tente novamente.');
      }
      const { error } = await db.from('google_conexoes').delete().eq('user_id', user.id);
      if (error) throw new HttpError(503, 'Não foi possível remover a conexão.');
      return json({ ok: true });
    }
    const cfg = configuracaoGoogle();
    if (body.acao === 'iniciar') {
      const state = randomBytes(32).toString('base64url');
      await db.from('google_oauth_estados').delete().lt('expira_em', new Date().toISOString());
      const { error } = await db.from('google_oauth_estados').insert({ hash: hashEstado(state), user_id: user.id, expira_em: new Date(Date.now() + 10 * 60_000).toISOString() });
      if (error) throw new HttpError(503, 'Não foi possível iniciar a conexão Google.');
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: 'code', scope: `openid email ${GOOGLE_SCOPE}`, access_type: 'offline', prompt: 'consent', state }).toString();
      return json({ url: url.href, state });
    }
    if (body.acao !== 'concluir' || typeof body.state !== 'string' || body.state.length > 100 || typeof body.code !== 'string' || body.code.length > 4096) throw new HttpError(400, 'Retorno Google inválido.');
    // Consumo atômico: estado de uso único e vinculado à sessão autenticada que iniciou o fluxo.
    const { data: estado, error: estadoErro } = await db.from('google_oauth_estados').delete().eq('hash', hashEstado(body.state)).eq('user_id', user.id).gt('expira_em', new Date().toISOString()).select('user_id').maybeSingle();
    if (estadoErro || !estado) throw new HttpError(400, 'A conexão expirou ou pertence a outra sessão. Inicie novamente.');
    const tokenRes = await googleFetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: 'authorization_code', code: body.code }) });
    const token = await tokenRes.json();
    if (!tokenRes.ok || !token.access_token || !token.refresh_token || !String(token.scope).split(' ').includes(GOOGLE_SCOPE)) throw new HttpError(400, 'Autorize o acesso ao Google Agenda para concluir a conexão.');
    const infoRes = await googleFetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${token.access_token}` } });
    const info = await infoRes.json();
    if (!infoRes.ok || !info.email_verified || typeof info.email !== 'string') throw new HttpError(400, 'O Google não confirmou o e-mail desta conta.');
    const { error } = await db.from('google_conexoes').upsert({ user_id: user.id, email: info.email, refresh_token: protegerToken(token.refresh_token), atualizado_em: new Date().toISOString() });
    if (error) throw new HttpError(503, 'Não foi possível salvar a conexão Google.');
    return json({ ok: true });
  } catch (e) { return falha(e); }
}
