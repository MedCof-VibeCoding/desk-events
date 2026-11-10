import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from './supabase';
import { Icon } from './Icon';
import { erroColaboracao, linkReuniao } from './colaboracao';
interface Reuniao { id: string; criado_por: string; titulo: string; pauta: string; inicio: string; fim: string; link: string; estado: 'agendada' | 'cancelada' }
export function Reunioes({ escritorioId, userId, podeOperar, podeEditar }: { escritorioId: string; userId: string; podeOperar: boolean; podeEditar: boolean }) {
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [criando, setCriando] = useState(false);
  const [titulo, setTitulo] = useState(''), [pauta, setPauta] = useState(''), [inicio, setInicio] = useState(''), [duracao, setDuracao] = useState('30'), [link, setLink] = useState('');
  const [erro, setErro] = useState(''), [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true), [disponivel, setDisponivel] = useState(false);
  const [historico, setHistorico] = useState(false), [confirmar, setConfirmar] = useState<string | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('reunioes').select('*').eq('escritorio_id', escritorioId).order('inicio', { ascending: historico ? false : true })
      [historico ? 'lt' : 'gte']('fim', new Date().toISOString()).limit(100);
    if (error) { setErro(erroColaboracao(error)); setDisponivel(false); }
    else { setReunioes((data ?? []) as Reuniao[]); setDisponivel(true); setErro(''); }
    setCarregando(false);
  }, [escritorioId, historico]);
  useEffect(() => { void carregar(); const timer = setInterval(() => { setAgora(Date.now()); void carregar(); }, 60_000);
    const sub = supabase.channel(`reunioes-${escritorioId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'reunioes', filter: `escritorio_id=eq.${escritorioId}` }, () => void carregar()).subscribe();
    return () => { clearInterval(timer); void supabase.removeChannel(sub); };
  }, [escritorioId, carregar]);
  async function salvar(e: FormEvent) {
    e.preventDefault(); if (salvando) return;
    const url = linkReuniao(link), quando = new Date(inicio);
    if (!titulo.trim()) { setErro('Informe o título da reunião.'); return; }
    if (!url) { setErro('Informe um link HTTPS válido da reunião, sem usuário ou senha no endereço.'); return; }
    if (!Number.isFinite(quando.getTime()) || quando.getTime() <= Date.now()) { setErro('Escolha uma data e um horário no futuro.'); return; }
    setSalvando(true); setErro('');
    try {
      const { error } = await supabase.from('reunioes').insert({ escritorio_id: escritorioId, criado_por: userId, titulo: titulo.trim(), pauta: pauta.trim(), inicio: quando.toISOString(), fim: new Date(quando.getTime() + Number(duracao) * 60_000).toISOString(), link: url });
      if (error) setErro(erroColaboracao(error));
      else { setCriando(false); setTitulo(''); setPauta(''); setInicio(''); setLink(''); await carregar(); }
    } catch { setErro('Não foi possível agendar a reunião. Tente novamente.'); }
    finally { setSalvando(false); }
  }
  async function cancelar(id: string) {
    setSalvando(true);
    try { const { error } = await supabase.from('reunioes').update({ estado: 'cancelada' }).eq('id', id).eq('escritorio_id', escritorioId).select('id').single();
      if (error) setErro(erroColaboracao(error)); else { setConfirmar(null); await carregar(); }
    } catch { setErro('Não foi possível cancelar a reunião.'); } finally { setSalvando(false); }
  }
  const lista = reunioes.filter(r => historico || r.estado !== 'cancelada');
  return <section className="pagina-workspace" aria-labelledby="titulo-reunioes">
    <div className="pagina-titulo"><div><span className="sobretitulo">TEMPO JUNTOS</span><h2 id="titulo-reunioes">Reuniões da equipe</h2><p className="mudo">Organize a pauta e encontre o link da próxima conversa.</p></div>{podeOperar && <button className="btn primario" disabled={!disponivel} onClick={() => { setCriando(!criando); setErro(''); }}><Icon name="plus" />{criando ? 'Fechar formulário' : 'Agendar reunião'}</button>}</div>
    <p className="aviso-reuniao"><Icon name="link" />As chamadas abrem no serviço do link informado, como Meet, Teams ou Zoom. Áudio e vídeo não são hospedados no Desk Events.</p>
    {erro && <div className="aviso-recurso" role="alert"><p>{erro}</p><button className="btn pequeno" onClick={() => void carregar()}>Atualizar agenda</button></div>}
    {criando && <form className="form-reuniao cartao" onSubmit={salvar}><h3>Nova reunião</h3><label htmlFor="r-titulo">Título</label><input id="r-titulo" required maxLength={120} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Alinhamento do próximo evento" />
      <div className="duas"><div><label htmlFor="r-inicio">Data e horário local</label><input id="r-inicio" type="datetime-local" required value={inicio} onChange={e => setInicio(e.target.value)} /></div><div><label htmlFor="r-duracao">Duração</label><select id="r-duracao" value={duracao} onChange={e => setDuracao(e.target.value)}>{[15,30,45,60,90,120].map(n => <option key={n} value={n}>{n} minutos</option>)}</select></div></div>
      <label htmlFor="r-link">Link da chamada</label><input id="r-link" type="url" required maxLength={2048} placeholder="https://meet.google.com/…" value={link} onChange={e => setLink(e.target.value)} />
      <label htmlFor="r-pauta">Pauta</label><textarea id="r-pauta" maxLength={4000} rows={3} value={pauta} onChange={e => setPauta(e.target.value)} placeholder="O que precisamos decidir?" /><div className="acoes fim"><button type="button" className="btn" onClick={() => setCriando(false)}>Cancelar</button><button className="btn primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar reunião'}</button></div>
    </form>}
    <div className="segmentos" role="group" aria-label="Período da agenda"><button aria-pressed={!historico} onClick={() => setHistorico(false)}>Próximas</button><button aria-pressed={historico} onClick={() => setHistorico(true)}>Histórico</button></div>
    {carregando ? <p role="status">Carregando agenda…</p> : disponivel && lista.length === 0 ? <div className="estado-vazio"><Icon name="calendar" size={40} /><h3>{historico ? 'Nenhuma reunião no histórico' : 'Espaço livre na agenda'}</h3><p>{historico ? 'As reuniões encerradas aparecerão aqui.' : 'Agende o próximo encontro para que todos encontrem os detalhes.'}</p></div> : <div className="lista-reunioes">{lista.map(r => {
      const inicioData = new Date(r.inicio), linkSeguro = linkReuniao(r.link), emAndamento = inicioData.getTime() <= agora && new Date(r.fim).getTime() > agora && r.estado === 'agendada';
      return <article className="card-reuniao" key={r.id}><div className="data-reuniao"><span>{inicioData.toLocaleDateString('pt-BR', { month: 'short' })}</span><strong>{inicioData.getDate()}</strong></div><div><span className="sobretitulo">{inicioData.toLocaleDateString('pt-BR', { weekday: 'long' })} · {inicioData.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} — {new Date(r.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><h3>{r.titulo}</h3>{emAndamento && <span className="estado trabalhando">Em andamento</span>}{r.estado === 'cancelada' && <span className="estado">Cancelada</span>}<p className="pauta-reuniao">{r.pauta || 'Sem pauta adicionada.'}</p>
        <div className="linha-acoes">{r.estado !== 'cancelada' && linkSeguro && <a className="btn primario" href={linkSeguro} target="_blank" rel="noopener noreferrer">Abrir chamada <Icon name="arrow" size={16} /></a>}{!historico && r.estado === 'agendada' && (podeEditar || (podeOperar && r.criado_por === userId)) && <button className="link" onClick={() => setConfirmar(r.id)}>Cancelar reunião</button>}</div>
        {confirmar === r.id && <div className="confirmacao-reuniao"><p>Cancelar esta reunião para toda a equipe?</p><button className="btn pequeno" onClick={() => setConfirmar(null)}>Manter</button> <button className="btn pequeno perigo" disabled={salvando} onClick={() => void cancelar(r.id)}>Confirmar cancelamento</button></div>}
      </div></article>;
    })}</div>}
  </section>;
}
