import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, pode, type Agente, type Escritorio, type Papel } from './supabase';
import { Workspace } from './Workspace';
import { AgentForm } from './AgentForm';
import { AgentPanel } from './AgentPanel';
import { Mesa } from './Mesa';
import type { Perfil, SalaAcesso } from './social';
import { useSalaSocial } from './useSalaSocial';
import { AcessosSala } from './AcessosSala';
import { SINAL_PONTE_MS, desligarPonte, ligarPonte, navegadorComPasta } from './ponteLocal';


export function Office({ session, perfil }: { session: Session; perfil: Perfil }) {
  const [escritorio, setEscritorio] = useState<Escritorio | null>(null);
  const [papel, setPapel] = useState<Papel | null>(null);
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [nomeNovo, setNomeNovo] = useState('');
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Agente | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());
  const [mesa, setMesa] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const [ponteLigada, setPonteLigada] = useState(false);
  const [pastaPonte, setPastaPonte] = useState<string | null>(null);
  const [ligando, setLigando] = useState(false);
  const [salas, setSalas] = useState<SalaAcesso[]>([]), [novaSala, setNovaSala] = useState(false), [salvandoSala, setSalvandoSala] = useState(false);
  const salaAtual = useRef<string | null>(null);
  const social = useSalaSocial(escritorio?.id, perfil);

  const carregarAgentes = useCallback(async (escId: string) => {
    const { data, error } = await supabase.from('agentes').select('*').eq('escritorio_id', escId).order('criado_em');
    if (salaAtual.current !== escId) return;
    if (error) setErro(error.message); else setAgentes((data ?? []) as Agente[]);
  }, []);

  // Agentes com ficha na fila ou em andamento: é o que faz o robô ir para a mesa.
  const carregarOcupados = useCallback(async (escId: string) => {
    const { data } = await supabase.from('fichas').select('agente_atual').eq('escritorio_id', escId).in('estado', ['fila', 'trabalhando']);
    if (salaAtual.current !== escId) return;
    setOcupados(new Set((data ?? []).map(f => f.agente_atual as string).filter(Boolean)));
  }, []);

  const contarPendentes = useCallback(async (escId: string) => {
    const { count } = await supabase.from('aprovacoes').select('id', { count: 'exact', head: true }).eq('escritorio_id', escId).eq('estado', 'pendente');
    if (salaAtual.current !== escId) return;
    setPendentes(count ?? 0);
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    const [salasRes, membrosRes] = await Promise.all([
      supabase.from('escritorios').select('id,nome,pausado,principal,criado_por').order('principal', { ascending: false }).order('nome'),
      supabase.from('membros').select('escritorio_id,papel').eq('user_id', session.user.id)
    ]);
    if (salasRes.error || membrosRes.error) { setErro('Não foi possível carregar suas salas.'); setCarregando(false); return; }
    const lista = (salasRes.data ?? []).map(s => ({ ...s, papel: (membrosRes.data?.find(m => m.escritorio_id === s.id)?.papel ?? 'leitor') as Papel }));
    setSalas(lista);
    const escolhida = lista.find(s => s.id === salaAtual.current) ?? lista[0];
    if (escolhida) { salaAtual.current = escolhida.id; setEscritorio(escolhida); setPapel(escolhida.papel); await Promise.all([carregarAgentes(escolhida.id), carregarOcupados(escolhida.id), contarPendentes(escolhida.id)]); }
    else { setEscritorio(null); setPapel(null); setAgentes([]); }
    setCarregando(false);
  }, [session.user.id, carregarAgentes, carregarOcupados, contarPendentes]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const sub = supabase.channel(`acessos-${session.user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'membros', filter: `user_id=eq.${session.user.id}` }, () => void carregar()).subscribe();
    return () => { void supabase.removeChannel(sub); };
  }, [carregar, session.user.id]);

  // A ponte local desta pessoa conta como ligada se deu sinal nos últimos dois minutos.
  useEffect(() => {
    const ver = async () => {
      const { data } = await supabase.from('pontes').select('visto_em').eq('user_id', session.user.id).maybeSingle();
      setPonteLigada(!!data && Date.now() - Date.parse(data.visto_em) < SINAL_PONTE_MS);
    };
    ver(); const t = setInterval(ver, 20_000);
    return () => clearInterval(t);
  }, [session.user.id]);

  useEffect(() => () => { void desligarPonte().catch(() => {}); }, []);

  // Ao vivo: qualquer mudança nos agentes do escritório aparece para todo o time.
  useEffect(() => {
    if (!escritorio) return;
    const canal = supabase.channel(`agentes-${escritorio.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agentes', filter: `escritorio_id=eq.${escritorio.id}` }, () => carregarAgentes(escritorio.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fichas', filter: `escritorio_id=eq.${escritorio.id}` }, () => carregarOcupados(escritorio.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aprovacoes', filter: `escritorio_id=eq.${escritorio.id}` }, () => contarPendentes(escritorio.id))
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [escritorio, carregarAgentes, carregarOcupados, contarPendentes]);

  async function ligar() {
    if (!escritorio || ligando) return;
    setLigando(true); setErro('');
    try {
      const pasta = await ligarPonte(session.user.id, escritorio.id);
      if (pasta) { setPastaPonte(pasta); setPonteLigada(true); }
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível ligar a ponte.'); }
    setLigando(false);
  }

  async function desligar() {
    try { await desligarPonte(); setPastaPonte(null); setPonteLigada(false); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível desligar a ponte.'); }
  }

  async function sair() {
    try { await desligarPonte(); } catch { /* a sessão encerra mesmo se o registro da ponte falhar */ }
    await supabase.auth.signOut();
  }

  async function criarEscritorio(e: FormEvent) {
    e.preventDefault();
    if (salvandoSala || !nomeNovo.trim()) return;
    setSalvandoSala(true);
    const { data, error } = await supabase.from('escritorios').insert({ nome: nomeNovo.trim() }).select('id').single();
    if (error) setErro(error.message); else { salaAtual.current = data.id; setNomeNovo(''); setNovaSala(false); await carregar(); }
    setSalvandoSala(false);
  }

  async function trocarSala(id: string) {
    if (id === escritorio?.id) return;
    await desligarPonte().catch(() => {}); setPastaPonte(null); setPonteLigada(false);
    setCriando(false); setEditando(null); setAberto(null); setMesa(false); setAgentes([]); setOcupados(new Set());
    salaAtual.current = id; await carregar();
  }

  if (carregando) return <main className="centro"><p>Carregando o escritório…</p></main>;

  if (!escritorio) {
    return (
      <main className="centro">
        <form className="cartao login" onSubmit={criarEscritorio}>
          <h1>Criar o escritório</h1>
          <p className="mudo">Você ainda não participa de nenhum escritório. Quem cria vira dono e convida o time depois.</p>
          <label htmlFor="nome">Nome do escritório</label>
          <input id="nome" required maxLength={80} value={nomeNovo} onChange={e => setNomeNovo(e.target.value)} placeholder="MedCof Eventos" />
          {erro && <p className="erro" role="alert">{erro}</p>}
          <button className="btn primario">Criar escritório</button>
          <button type="button" className="link" onClick={() => supabase.auth.signOut()}>Sair</button>
        </form>
      </main>
    );
  }

  const selecionado = agentes.find(a => a.id === aberto);
  return <Workspace escritorio={escritorio} papel={papel} userId={session.user.id} email={session.user.email ?? ''}
    key={escritorio.id} perfil={perfil} social={social}
    salasControle={<div className="salas-controle"><label htmlFor="sala-atual">Onde você está</label><select id="sala-atual" value={escritorio.id} onChange={e => void trocarSala(e.target.value)}>{salas.map(s => <option value={s.id} key={s.id}>{s.principal ? '🏢 ' : ''}{s.nome}</option>)}</select><button className="btn" onClick={() => setNovaSala(!novaSala)}>+ Minha sala</button>{novaSala && <form className="salas-nova" onSubmit={criarEscritorio}><label htmlFor="nova-sala">Nome da nova sala</label><input id="nova-sala" required maxLength={80} value={nomeNovo} onChange={e => setNomeNovo(e.target.value)} placeholder="Minha equipe" /><button className="btn primario" disabled={salvandoSala}>{salvandoSala ? 'Criando…' : 'Criar sala privada'}</button></form>}</div>}
    acessos={salas.find(s => s.id === escritorio.id) ? <AcessosSala sala={salas.find(s => s.id === escritorio.id)!} perfil={perfil} /> : null}
    agentes={agentes} ocupados={ocupados} selecionado={aberto} pendentes={pendentes} mesa={mesa} erro={erro}
    onAgente={id => { setMesa(false); setAberto(id); }}
    onCriar={() => { if (pode(papel, 'editor')) { setEditando(null); setCriando(true); } }}
    onEditar={agente => { setCriando(false); setEditando(agente); }}
    onMesa={() => { setMesa(!mesa); setAberto(null); }}
    onFecharPainel={() => { setMesa(false); setAberto(null); }} onSair={() => void sair()}
    ponte={<>
      {pode(papel, 'operador') ? pastaPonte ? <>
        <span className="ponte ligada" title={pastaPonte}>Ponte local ligada · <span className="pasta">{pastaPonte}</span></span>
        <button className="btn" onClick={() => void desligar()}>Desligar</button>
      </> : ponteLigada ? <span className="ponte ligada">Ponte local ligada</span> :
        <button className="ponte" disabled={ligando} title={navegadorComPasta() ? 'Deixa os agentes trabalharem em arquivos de uma pasta deste computador.' : 'Use Chrome ou Edge para escolher uma pasta.'} onClick={() => void ligar()}>{ligando ? 'Ligando a ponte…' : 'Conectar pasta deste computador'}</button>
      : <span className={'ponte' + (ponteLigada ? ' ligada' : '')}>Ponte local {ponteLigada ? 'ligada' : 'desligada'}</span>}
    </>}
    painel={mesa ? <Mesa escritorioId={escritorio.id} podeOperar={pode(papel, 'operador')} onFechar={() => setMesa(false)} onMudou={setPendentes} /> : selecionado ?
      <AgentPanel key={selecionado.id} agente={selecionado} podeOperar={pode(papel, 'operador')} podeEditar={pode(papel, 'editor')} onFechar={() => setAberto(null)} onEditar={() => { setCriando(false); setEditando(selecionado); }} onExcluido={() => { const id = aberto; setAgentes(lista => lista.filter(a => a.id !== id)); setOcupados(atual => { const prox = new Set(atual); if (id) prox.delete(id); return prox; }); setEditando(atual => atual?.id === id ? null : atual); setAberto(null); }} /> : null}
    modal={(criando || editando) ? <AgentForm key={editando?.id ?? 'novo'} escritorioId={escritorio.id} agente={editando ?? undefined} coresUsadas={agentes.filter(a => a.id !== editando?.id).map(a => a.aparencia.cor)} onFechar={() => { setCriando(false); setEditando(null); }} onSalvo={() => { setCriando(false); setEditando(null); void carregarAgentes(escritorio.id); }} /> : null}
  />;
}
