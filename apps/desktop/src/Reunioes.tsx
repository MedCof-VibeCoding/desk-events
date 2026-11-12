import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { servidor, supabase } from './supabase';
import { Icon } from './Icon';
import { erroColaboracao, linkReuniao } from './colaboracao';
import type { Perfil } from './social';
interface Reuniao { id: string; criado_por: string; titulo: string; pauta: string; inicio: string; fim: string; link: string; estado: 'agendada' | 'cancelada'; convidados: string[]; google_event_id: string | null; sincronizacao: 'local' | 'pendente' | 'pronta' }
interface Conexao { conectado: boolean; configurado: boolean; email: string | null }
export function Reunioes({ escritorioId, userId, podeOperar }: { escritorioId: string; userId: string; podeOperar: boolean; podeEditar: boolean }) {
  const [reunioes, setReunioes] = useState<Reuniao[]>([]), [pessoas, setPessoas] = useState<Perfil[]>([]), [conexao, setConexao] = useState<Conexao | null>(null);
  const [criando, setCriando] = useState(false), [historico, setHistorico] = useState(false);
  const [titulo, setTitulo] = useState(''), [pauta, setPauta] = useState(''), [inicio, setInicio] = useState(''), [duracao, setDuracao] = useState('30');
  const [convidados, setConvidados] = useState<string[]>([]), [erro, setErro] = useState(''), [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true), [confirmar, setConfirmar] = useState<string | null>(null), [confirmarDesconexao, setConfirmarDesconexao] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  const pedidoId = useRef(crypto.randomUUID());
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('reunioes').select('*').eq('escritorio_id', escritorioId).order('inicio', { ascending: !historico })[historico ? 'lt' : 'gte']('fim', new Date().toISOString()).limit(100);
    if (error) setErro(erroColaboracao(error)); else setReunioes((data ?? []) as Reuniao[]);
    setCarregando(false);
  }, [escritorioId, historico]);
  const carregarGoogle = useCallback(async () => {
    try { setConexao(await servidor<Conexao>('/api/google')); } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível consultar o Google Agenda.'); }
  }, []);
  useEffect(() => {
    let ativo = true;
    void carregarGoogle();
    void Promise.all([supabase.from('perfis').select('*').not('aparencia', 'is', null).order('nome'), supabase.from('escritorios').select('principal').eq('id', escritorioId).single(), supabase.from('membros').select('user_id').eq('escritorio_id', escritorioId)]).then(([perfis, sala, membros]) => {
      if (!ativo) return;
      if (perfis.error || sala.error || membros.error) { setErro('Não foi possível carregar os participantes.'); return; }
      setPessoas((perfis.data as Perfil[]).filter(p => p.user_id !== userId && p.nome.trim() && (sala.data.principal || membros.data.some(m => m.user_id === p.user_id))));
    });
    return () => { ativo = false; };
  }, [escritorioId, userId, carregarGoogle]);
  useEffect(() => {
    void carregar(); const timer = setInterval(() => { setAgora(Date.now()); void carregar(); }, 30_000);
    const sub = supabase.channel(`reunioes-${escritorioId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'reunioes', filter: `escritorio_id=eq.${escritorioId}` }, () => void carregar()).subscribe();
    return () => { clearInterval(timer); void supabase.removeChannel(sub); };
  }, [escritorioId, carregar]);
  async function conectar() {
    setSalvando(true); setErro('');
    try {
      const data = await servidor<{ url: string; state: string }>('/api/google', { method: 'POST', body: JSON.stringify({ acao: 'iniciar' }) });
      const url = new URL(data.url); if (url.origin !== 'https://accounts.google.com') throw new Error('Endereço de autorização inválido.');
      sessionStorage.setItem('desk-google-state', data.state); window.location.assign(url.href);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível conectar.'); setSalvando(false); }
  }
  async function desconectar() {
    setSalvando(true); setErro('');
    try { await servidor('/api/google', { method: 'POST', body: JSON.stringify({ acao: 'desconectar' }) }); await carregarGoogle(); setConfirmarDesconexao(false); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível desconectar.'); } finally { setSalvando(false); }
  }
  async function salvar(e: FormEvent) {
    e.preventDefault(); if (salvando) return;
    const quando = new Date(inicio);
    if (!titulo.trim() || !Number.isFinite(quando.getTime()) || quando.getTime() <= Date.now() || !convidados.length) { setErro('Informe o título, um horário futuro e pelo menos um participante.'); return; }
    setSalvando(true); setErro('');
    try {
      await servidor('/api/reunioes', { method: 'POST', body: JSON.stringify({ acao: 'criar', reuniao: { id: pedidoId.current, escritorioId, titulo, pauta, inicio: quando.toISOString(), fim: new Date(quando.getTime() + Number(duracao) * 60_000).toISOString(), convidados } }) });
      setCriando(false); setTitulo(''); setPauta(''); setInicio(''); setConvidados([]); pedidoId.current = crypto.randomUUID(); await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível agendar.'); await carregar(); }
    finally { setSalvando(false); }
  }
  async function cancelar(r: Reuniao) {
    setSalvando(true); setErro('');
    try {
      if (r.google_event_id) await servidor('/api/reunioes', { method: 'POST', body: JSON.stringify({ acao: 'cancelar', id: r.id }) });
      else { const { error } = await supabase.from('reunioes').update({ estado: 'cancelada' }).eq('id', r.id).select('id').single(); if (error) throw error; }
      setConfirmar(null); await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível cancelar.'); } finally { setSalvando(false); }
  }
  async function retomar(r: Reuniao) {
    setSalvando(true); setErro('');
    try { await servidor('/api/reunioes', { method: 'POST', body: JSON.stringify({ acao: 'criar', reuniao: { id: r.id, escritorioId, titulo: r.titulo, pauta: r.pauta, inicio: r.inicio, fim: r.fim, convidados: r.convidados } }) }); await carregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível atualizar.'); } finally { setSalvando(false); }
  }
  const lista = reunioes.filter(r => historico || r.estado !== 'cancelada');
  return <section className="pagina-workspace" aria-labelledby="titulo-reunioes">
    <div className="pagina-titulo"><div><span className="sobretitulo">SALA DE REUNIÃO</span><h2 id="titulo-reunioes">Um horário para conversar</h2><p className="mudo">Convide pessoas do aplicativo pelo Google Agenda e abra a chamada por aqui.</p></div>{podeOperar && <button className="btn primario" disabled={!conexao?.conectado || salvando} onClick={() => { setCriando(!criando); setErro(''); if (!criando) pedidoId.current = crypto.randomUUID(); }}><Icon name="plus" />{criando ? 'Fechar' : 'Agendar reunião'}</button>}</div>
    <div className="google-status">{conexao?.conectado ? <><span>Google Agenda conectado · {conexao.email}</span><button className="link" onClick={() => setConfirmarDesconexao(true)}>Desconectar</button></> : <><button className="btn" onClick={() => void conectar()} disabled={salvando || conexao?.configurado === false}>Conectar meu Google Agenda</button><span className="mudo">{conexao?.configurado === false ? 'A integração aguarda configuração do administrador.' : 'Cada pessoa autoriza sua própria conta Google.'}</span></>}</div>
    {confirmarDesconexao && <div className="aviso-recurso"><p>As reuniões continuam na agenda. Para gerenciá-las por aqui, você precisará reconectar a mesma conta.</p><button className="btn" onClick={() => setConfirmarDesconexao(false)}>Manter conexão</button> <button className="btn" disabled={salvando} onClick={() => void desconectar()}>Desconectar Google</button></div>}
    {erro && <div className="aviso-recurso" role="alert"><p>{erro}</p><button className="btn pequeno" onClick={() => { setErro(''); void carregar(); void carregarGoogle(); }}>Atualizar</button></div>}
    {criando && <form className="form-reuniao cartao" onSubmit={salvar}><h3>Nova reunião no Google Agenda</h3><label htmlFor="r-titulo">Título</label><input id="r-titulo" required maxLength={120} value={titulo} onChange={e => setTitulo(e.target.value)} />
      <div className="duas"><div><label htmlFor="r-inicio">Data e horário local</label><input id="r-inicio" type="datetime-local" required value={inicio} onChange={e => setInicio(e.target.value)} /></div><div><label htmlFor="r-duracao">Duração</label><select id="r-duracao" value={duracao} onChange={e => setDuracao(e.target.value)}>{[15,30,45,60,90,120].map(n => <option key={n} value={n}>{n} minutos</option>)}</select></div></div>
      <fieldset className="convidados-reuniao"><legend>Participantes desta sala</legend>{pessoas.length ? pessoas.map(p => <label key={p.user_id}><input type="checkbox" checked={convidados.includes(p.user_id)} onChange={e => setConvidados(ids => e.target.checked ? [...ids, p.user_id] : ids.filter(id => id !== p.user_id))} />{p.nome}</label>) : <p>Nenhuma outra pessoa com acesso a esta sala. Use o escritório principal para encontrar os demais usuários.</p>}</fieldset>
      <p className="mudo">O Google enviará convites. A inclusão na agenda de cada convidado depende das preferências e da resposta dele. Um link do Meet será solicitado automaticamente.</p>
      <label htmlFor="r-pauta">Pauta</label><textarea id="r-pauta" maxLength={4000} rows={3} value={pauta} onChange={e => setPauta(e.target.value)} /><div className="acoes fim"><button type="button" className="btn" onClick={() => setCriando(false)}>Fechar</button><button className="btn primario" disabled={salvando || !convidados.length}>{salvando ? 'Agendando…' : 'Agendar e enviar convites'}</button></div>
    </form>}
    <div className="segmentos" role="group" aria-label="Período da agenda"><button aria-pressed={!historico} onClick={() => setHistorico(false)}>Próximas</button><button aria-pressed={historico} onClick={() => setHistorico(true)}>Histórico</button></div>
    {carregando ? <p role="status">Carregando agenda…</p> : lista.length === 0 ? <div className="estado-vazio"><Icon name="calendar" size={40} /><h3>Nenhuma reunião neste período</h3></div> : <div className="lista-reunioes">{lista.map(r => {
      const inicioData = new Date(r.inicio), url = linkReuniao(r.link), emAndamento = inicioData.getTime() <= agora && new Date(r.fim).getTime() > agora && r.estado === 'agendada';
      return <article className="card-reuniao" key={r.id}><div className="data-reuniao"><span>{inicioData.toLocaleDateString('pt-BR', { month: 'short' })}</span><strong>{inicioData.getDate()}</strong></div><div><span className="sobretitulo">{inicioData.toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} – {new Date(r.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><h3>{r.titulo}</h3>{emAndamento && <span className="estado trabalhando">Em andamento</span>}{r.estado === 'cancelada' && <span className="estado">Cancelada</span>}<p className="pauta-reuniao">{r.pauta || 'Sem pauta adicionada.'}</p>
        {r.sincronizacao === 'pendente' && <p role="status">Aguardando confirmação do Google ou geração do link Meet.</p>}
        <div className="linha-acoes">{r.estado !== 'cancelada' && url && r.sincronizacao !== 'pendente' && <a className="btn primario" href={url} target="_blank" rel="noopener noreferrer">{url.includes('calendar.google.com') || url.includes('google.com/calendar') ? 'Abrir no Google Agenda' : 'Abrir chamada'} <Icon name="arrow" size={16} /></a>}{r.criado_por === userId && r.sincronizacao === 'pendente' && r.estado !== 'cancelada' && <button className="btn" disabled={salvando} onClick={() => void retomar(r)}>Concluir agendamento</button>}{!historico && r.estado === 'agendada' && r.criado_por === userId && <button className="link" onClick={() => setConfirmar(r.id)}>Cancelar reunião</button>}</div>
        {confirmar === r.id && <div className="confirmacao-reuniao"><p>Cancelar a reunião e avisar os convidados pelo Google?</p><button className="btn pequeno" onClick={() => setConfirmar(null)}>Manter</button> <button className="btn pequeno perigo" disabled={salvando} onClick={() => void cancelar(r)}>Confirmar cancelamento</button></div>}
      </div></article>;
    })}</div>}
  </section>;
}
