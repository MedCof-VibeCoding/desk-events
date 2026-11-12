import { admin, falha, HttpError, json, preflight, usuario } from '../lib/core.js';
import { corpoEvento, exigirSala, googleFetch, tokenGoogle, validarReuniao } from '../lib/google-agenda.js';
export const OPTIONS = () => preflight();
const base = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
export async function POST(request: Request) {
  try {
    const user = await usuario(request), db = admin(), body = await request.json();
    if (body.acao === 'cancelar' || body.acao === 'sincronizar') {
      const { data: r } = await db.from('reunioes').select('*').eq('id', body.id).eq('criado_por', user.id).maybeSingle();
      if (!r?.google_event_id) throw new HttpError(404, 'Agendamento não encontrado.');
      await exigirSala(user.id, r.escritorio_id);
      const cred = await tokenGoogle(user.id);
      if (cred.email !== r.google_calendar_email) throw new HttpError(409, 'Reconecte a conta Google usada para criar esta reunião.');
      const url = `${base}/${encodeURIComponent(r.google_event_id)}`;
      const res = await googleFetch(url + (body.acao === 'cancelar' ? '?sendUpdates=all' : ''), { method: body.acao === 'cancelar' ? 'DELETE' : 'GET', headers: { authorization: `Bearer ${cred.token}` } });
      if (body.acao === 'cancelar') {
        if (!res.ok && ![404,410].includes(res.status)) throw new HttpError(502, 'O Google não confirmou o cancelamento.');
        const { error } = await db.from('reunioes').update({ estado: 'cancelada', sincronizacao: 'pronta' }).eq('id', r.id);
        if (error) throw new HttpError(503, 'Cancelado no Google. Tente novamente para atualizar a sala.');
      } else {
        if (!res.ok) throw new HttpError(409, 'O agendamento ainda não está no Google. Reenvie o formulário original.');
        const event = await res.json();
        const { error } = await db.from('reunioes').update({ link: event.hangoutLink || event.htmlLink, sincronizacao: event.conferenceData?.createRequest?.status?.statusCode === 'pending' ? 'pendente' : 'pronta', estado: event.status === 'cancelled' ? 'cancelada' : 'agendada' }).eq('id', r.id);
        if (error) throw new HttpError(503, 'Não foi possível atualizar a sala.');
      }
      return json({ ok: true });
    }
    if (body.acao !== 'criar') throw new HttpError(400, 'Operação inválida.');
    const p = validarReuniao(body.reuniao);
    const sala = await exigirSala(user.id, p.escritorioId);
    const { data: anterior, error: consultaErro } = await db.from('reunioes').select('*').eq('id', p.id).maybeSingle();
    if (consultaErro) throw new HttpError(503, 'Não foi possível verificar o agendamento.');
    if (anterior && (anterior.criado_por !== user.id || anterior.escritorio_id !== p.escritorioId || anterior.titulo !== p.titulo || anterior.pauta !== p.pauta || Date.parse(anterior.inicio) !== Date.parse(p.inicio) || Date.parse(anterior.fim) !== Date.parse(p.fim) || JSON.stringify(anterior.convidados) !== JSON.stringify(p.convidados) || anterior.estado === 'cancelada')) throw new HttpError(409, 'Esse agendamento já foi usado. Abra um novo formulário.');
    if (!anterior && Date.parse(p.inicio) <= Date.now()) throw new HttpError(400, 'Escolha um horário no futuro.');
    const { data: perfis, error: perfisErro } = await db.from('perfis').select('user_id,aparencia,nome').in('user_id', p.convidados);
    if (perfisErro || perfis?.length !== p.convidados.length || perfis.some(p => !p.aparencia || !p.nome.trim())) throw new HttpError(400, 'Escolha pessoas cadastradas que já criaram seu avatar.');
    if (!sala.principal) {
      const { data: membros } = await db.from('membros').select('user_id').eq('escritorio_id', p.escritorioId).in('user_id', p.convidados);
      if (membros?.length !== p.convidados.length) throw new HttpError(403, 'Convide apenas pessoas com acesso à sala, ou use o escritório principal.');
    }
    const cred = await tokenGoogle(user.id);
    if (anterior?.google_calendar_email && anterior.google_calendar_email !== cred.email) throw new HttpError(409, 'Reconecte a conta Google original para continuar.');
    const emails = await Promise.all(p.convidados.map(async id => {
      const [{ data: conexao }, { data, error }] = await Promise.all([db.from('google_conexoes').select('email').eq('user_id', id).maybeSingle(), db.auth.admin.getUserById(id)]);
      if (error || !data.user?.email_confirmed_at || !data.user.email) throw new HttpError(400, 'Um participante ainda não confirmou seu e-mail.');
      return conexao?.email || data.user.email;
    }));
    const evento = corpoEvento(p, emails);
    if (!anterior) {
      const { error } = await db.from('reunioes').insert({ id: p.id, escritorio_id: p.escritorioId, criado_por: user.id, titulo: p.titulo, pauta: p.pauta, inicio: p.inicio, fim: p.fim, link: 'https://calendar.google.com/', convidados: p.convidados, google_event_id: evento.id, google_calendar_email: cred.email, sincronizacao: 'pendente' });
      if (error) throw new HttpError(409, 'O agendamento está sendo salvo. Tente novamente com este formulário.');
    }
    let res = await googleFetch(`${base}?conferenceDataVersion=1&sendUpdates=all`, { method: 'POST', headers: { authorization: `Bearer ${cred.token}`, 'content-type': 'application/json' }, body: JSON.stringify(evento) });
    if (res.status === 409) res = await googleFetch(`${base}/${evento.id}`, { headers: { authorization: `Bearer ${cred.token}` } });
    if (!res.ok) throw new HttpError(502, 'O Google não confirmou o agendamento. Confira a conexão e tente novamente neste formulário.');
    const event = await res.json();
    const { error } = await db.from('reunioes').update({ link: event.hangoutLink || event.htmlLink, sincronizacao: event.conferenceData?.createRequest?.status?.statusCode === 'pending' ? 'pendente' : 'pronta' }).eq('id', p.id);
    if (error) throw new HttpError(503, 'Reunião criada no Google. Tente novamente para atualizar a sala, sem duplicar o convite.');
    return json({ ok: true, id: p.id });
  } catch (e) { return falha(e); }
}
