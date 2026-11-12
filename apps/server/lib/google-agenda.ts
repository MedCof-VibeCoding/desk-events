import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { admin, HttpError } from './core.js';

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
export function configuracaoGoogle() {
  const clientId = process.env.GOOGLE_CLIENT_ID, clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const chave = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  const app = process.env.APP_URL;
  if (!clientId || !clientSecret || !chave || !/^[a-f\d]{64}$/i.test(chave) || !app) throw new HttpError(503, 'A integração com o Google Agenda ainda não foi configurada pelo administrador.');
  const url = new URL(app);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new HttpError(503, 'Endereço do aplicativo inválido.');
  return { clientId, clientSecret, chave: Buffer.from(chave, 'hex'), redirectUri: url.origin + '/google-agenda' };
}
export const hashEstado = (valor: string) => createHash('sha256').update(valor).digest('hex');
export function protegerToken(token: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', configuracaoGoogle().chave, iv);
  const conteudo = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), conteudo].map(b => b.toString('base64url')).join('.');
}
export function abrirToken(valor: string) {
  const [iv, tag, conteudo] = valor.split('.').map(v => Buffer.from(v, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', configuracaoGoogle().chave, iv); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(conteudo), decipher.final()]).toString('utf8');
}
export async function googleFetch(url: string, init?: RequestInit) {
  try { return await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) }); }
  catch { throw new HttpError(502, 'O Google não respondeu. Tente novamente; o mesmo agendamento será reutilizado.'); }
}
export async function tokenGoogle(userId: string) {
  const { data, error } = await admin().from('google_conexoes').select('refresh_token,email').eq('user_id', userId).maybeSingle();
  if (error) throw new HttpError(503, 'Não foi possível carregar a conexão Google.');
  if (!data) throw new HttpError(409, 'Conecte seu Google Agenda primeiro.');
  const cfg = configuracaoGoogle();
  const res = await googleFetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'refresh_token', refresh_token: abrirToken(data.refresh_token) }) });
  const body = await res.json();
  if (!res.ok || !body.access_token) throw new HttpError(409, 'Sua autorização Google expirou. Conecte a agenda novamente.');
  return { token: body.access_token as string, email: data.email as string };
}
export async function exigirSala(userId: string, sala: string) {
  const db = admin();
  const [{ data: perfil }, { data: escritorio }, { data: membro }] = await Promise.all([
    db.from('perfis').select('aparencia,nome').eq('user_id', userId).maybeSingle(),
    db.from('escritorios').select('id,principal').eq('id', sala).maybeSingle(),
    db.from('membros').select('papel').eq('user_id', userId).eq('escritorio_id', sala).maybeSingle()
  ]);
  if (!perfil?.aparencia || !perfil.nome.trim() || !escritorio || (!escritorio.principal && !membro)) throw new HttpError(403, 'Você não tem acesso a esta sala.');
  return escritorio;
}
export interface PedidoReuniao { id: string; escritorioId: string; titulo: string; pauta: string; inicio: string; fim: string; convidados: string[] }
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
export function validarReuniao(valor: unknown): PedidoReuniao {
  const p = valor as Partial<PedidoReuniao> | null;
  if (!p || typeof p.id !== 'string' || !uuid.test(p.id) || typeof p.escritorioId !== 'string' || !uuid.test(p.escritorioId)) throw new HttpError(400, 'Sala ou agendamento inválido.');
  if (typeof p.titulo !== 'string' || !p.titulo.trim() || p.titulo.trim().length > 120 || typeof p.pauta !== 'string' || p.pauta.length > 4000) throw new HttpError(400, 'Confira o título e a pauta.');
  const inicio = Date.parse(p.inicio ?? ''), fim = Date.parse(p.fim ?? '');
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio || fim - inicio > 120 * 60_000) throw new HttpError(400, 'Confira o horário e a duração (até 2 horas).');
  if (!Array.isArray(p.convidados) || !p.convidados.length || p.convidados.length > 50 || p.convidados.some(id => typeof id !== 'string' || !uuid.test(id))) throw new HttpError(400, 'Selecione entre 1 e 50 participantes cadastrados.');
  return { id: p.id, escritorioId: p.escritorioId, titulo: p.titulo.trim(), pauta: p.pauta.trim(), inicio: new Date(inicio).toISOString(), fim: new Date(fim).toISOString(), convidados: [...new Set(p.convidados)].sort() };
}
export const eventoId = (id: string) => 'desk' + id.replace(/-/g, '').toLowerCase();
export function corpoEvento(p: PedidoReuniao, emails: string[]) {
  return { id: eventoId(p.id), summary: p.titulo, description: p.pauta, start: { dateTime: p.inicio }, end: { dateTime: p.fim }, attendees: [...new Set(emails)].map(email => ({ email })), guestsCanModify: false, guestsCanInviteOthers: false, conferenceData: { createRequest: { requestId: p.id, conferenceSolutionKey: { type: 'hangoutsMeet' } } }, extendedProperties: { private: { desk_events_id: p.id } } };
}
