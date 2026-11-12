import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, pode, type Agente, type Escritorio, type Papel } from './supabase';
import { Workspace } from './Workspace';
import { AgentForm } from './AgentForm';
import { AgentPanel } from './AgentPanel';
import { Mesa } from './Mesa';
import type { Perfil, SalaAcesso } from './social';
import { useSalaSocial } from './useSalaSocial';
import { AcessosSala } from './AcessosSala';
import { SINAL_PONTE_MS, desligarPonte, ligarPonte, navegadorComPasta, retomarPonte, pastaGuardada } from './ponteLocal';
import { MeuComputador, type EstadoPc } from './MeuComputador';
import './extras.css';


export function Office({ session, perfil }: { session: Session; perfil: Perfil }) {
  const [escritorio, setEscritorio] = useState<Escritorio | null>(null);
  const [papel, setPapel] = useState<Papel | null>(null);
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Agente | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());
  const [mesa, setMesa] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const [ponteLigada, setPonteLigada] = useState(false);
  const [pc, setPc] = useState<EstadoPc>({ ligado: false, viaConector: false, computador: '', pasta: null, comandos: false });
  const [pastaAntiga, setPastaAntiga] = useState<string | null>(null);
  const [pastaPonte, setPastaPonte] = useState<string | null>(null);
  const [ligando, setLigando] = useState(false);
  const [salas, setSalas] = useState<SalaAcesso[]>([]);
  const [computador, setComputador] = useState(false);
  const [erroPc, setErroPc] = useState('');
  const salaAtual = useRef<string | null>(null);
  // A sala pessoal desta pessoa, criada pelo banco quando o perfil fica completo.
  const minhaSala = useRef<string | null>(null);
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
    if (!minhaSala.current) {
      const { data: sala } = await supabase.rpc('minha_sala');
      if (typeof sala === 'string') minhaSala.current = sala;
    }
    const [salasRes, membrosRes] = await Promise.all([
      supabase.from('escritorios').select('id,nome,pausado,principal,pessoal,criado_por').order('principal', { ascending: false }).order('nome'),
      supabase.from('membros').select('escritorio_id,papel').eq('user_id', session.user.id)
    ]);
    if (salasRes.error || membrosRes.error) { setErro('Não foi possível carregar suas salas.'); setCarregando(false); return; }
    const lista = (salasRes.data ?? []).map(s => ({ ...s, papel: (membrosRes.data?.find(m => m.escritorio_id === s.id)?.papel ?? 'leitor') as Papel }));
    setSalas(lista);
    // Ao entrar, todos começam no escritório principal, onde as pessoas se encontram. A sala pessoal fica a um clique.
    const escolhida = lista.find(s => s.id === salaAtual.current) ?? lista.find(s => s.principal) ?? lista.find(s => s.id === minhaSala.current) ?? lista[0];
    if (escolhida) { salaAtual.current = escolhida.id; setEscritorio(escolhida); setPapel(escolhida.papel); await Promise.all([carregarAgentes(escolhida.id), carregarOcupados(escolhida.id), contarPendentes(escolhida.id)]); }
    else { setEscritorio(null); setPapel(null); setAgentes([]); }
    setCarregando(false);
  }, [session.user.id, carregarAgentes, carregarOcupados, contarPendentes]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const sub = supabase.channel(`acessos-${session.user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'membros', filter: `user_id=eq.${session.user.id}` }, () => void carregar()).subscribe();
    return () => { void supabase.removeChannel(sub); };
  }, [carregar, session.user.id]);

  // Quem está conectando este computador: o DeskCof Conector instalado ou esta aba do navegador.
  const verPonte = useCallback(async () => {
    const { data } = await supabase.from('pontes').select('visto_em, nome, pasta').eq('user_id', session.user.id).maybeSingle();
    const vivo = !!data && Date.now() - Date.parse(data.visto_em) < SINAL_PONTE_MS;
    const nome = String(data?.nome ?? '');
    const viaConector = vivo && nome.startsWith('conector:');
    setPonteLigada(vivo);
    setPc({ ligado: vivo, viaConector, computador: viaConector ? nome.slice(9).replace(' (comandos)', '') : '', pasta: vivo ? (data?.pasta ?? null) : null, comandos: nome.endsWith('(comandos)') });
    return { vivo, viaConector };
  }, [session.user.id]);
  useEffect(() => {
    void verPonte(); const t = setInterval(() => void verPonte(), 15_000);
    const canal = supabase.channel(`ponte-${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pontes', filter: `user_id=eq.${session.user.id}` }, () => void verPonte()).subscribe();
    return () => { clearInterval(t); void supabase.removeChannel(canal); };
  }, [session.user.id, verPonte]);

  // Sem o Conector ligado, religa sozinha a pasta do navegador se a permissão já foi dada.
  const tentouRetomar = useRef(false);
  useEffect(() => {
    if (carregando || tentouRetomar.current || !minhaSala.current) return;
    tentouRetomar.current = true;
    void (async () => {
      setPastaAntiga(await pastaGuardada());
      const { viaConector } = await verPonte();
      if (viaConector) return;
      const pasta = await retomarPonte(session.user.id, minhaSala.current!).catch(() => null);
      if (pasta) { setPastaPonte(pasta); void verPonte(); }
    })();
  }, [carregando, session.user.id, verPonte]);

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

  // A ponte é da pessoa, não da sala: fica registrada na sala pessoal e continua ligada ao trocar de sala.
  async function ligar(novaPasta = false) {
    const sala = minhaSala.current;
    if (!sala || ligando) return;
    setLigando(true); setErroPc('');
    try {
      const pasta = await ligarPonte(session.user.id, sala, novaPasta);
      if (pasta) { setPastaPonte(pasta); setPonteLigada(true); void verPonte(); }
    } catch (e) { setErroPc(e instanceof Error ? e.message : 'Não foi possível conectar a pasta.'); }
    setLigando(false);
  }

  async function desligar() {
    try { await desligarPonte(); setPastaPonte(null); setPonteLigada(false); void verPonte(); }
    catch (e) { setErroPc(e instanceof Error ? e.message : 'Não foi possível desconectar.'); }
  }

  async function sair() {
    try { await desligarPonte(); } catch { /* a sessão encerra mesmo se o registro da ponte falhar */ }
    await supabase.auth.signOut();
  }

  async function trocarSala(id: string) {
    if (id === escritorio?.id) return;
    setCriando(false); setEditando(null); setAberto(null); setMesa(false); setAgentes([]); setOcupados(new Set());
    salaAtual.current = id; await carregar();
  }

  if (carregando) return <main className="centro"><p>Carregando o escritório…</p></main>;

  if (!escritorio) {
    return (
      <main className="centro">
        <div className="cartao login">
          <h1>Preparando sua sala</h1>
          <p className="mudo">Sua sala é criada assim que o seu e-mail é confirmado e o seu perfil está completo.</p>
          {erro && <p className="erro" role="alert">{erro}</p>}
          <button className="btn primario" onClick={() => void carregar()}>Tentar de novo</button>
          <button type="button" className="link" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </main>
    );
  }

  const selecionado = agentes.find(a => a.id === aberto);
  return <Workspace escritorio={escritorio} papel={papel} userId={session.user.id} email={session.user.email ?? ''}
    key={escritorio.id} perfil={perfil} social={social}
    salasControle={<div className="salas-controle">
      <span className="rotulo-sala" id="onde-estou">Onde você está</span>
      <div className="salas-alternar" role="group" aria-labelledby="onde-estou">
        <button aria-pressed={escritorio.id === minhaSala.current} disabled={!minhaSala.current} onClick={() => minhaSala.current && void trocarSala(minhaSala.current)}>Minha sala</button>
        <button aria-pressed={!!salas.find(s => s.principal && s.id === escritorio.id)} disabled={!salas.some(s => s.principal)} onClick={() => { const pr = salas.find(s => s.principal); if (pr) void trocarSala(pr.id); }}>Escritório principal</button>
      </div>
      {salas.some(s => !s.principal && s.id !== minhaSala.current) && (
        <><label htmlFor="outras-salas" className="so-leitor">Outras salas</label>
        <select id="outras-salas" className="salas-outras" value={salas.some(s => s.id === escritorio.id && !s.principal && s.id !== minhaSala.current) ? escritorio.id : ''} onChange={e => e.target.value && void trocarSala(e.target.value)}>
          <option value="">Outras salas em que você participa…</option>
          {salas.filter(s => !s.principal && s.id !== minhaSala.current).map(s => <option value={s.id} key={s.id}>{s.nome}</option>)}
        </select></>
      )}
      <button className={'atalho-computador' + (ponteLigada ? ' ligado' : '')} onClick={() => { setErroPc(''); setComputador(true); }}>
        <span className="luz" aria-hidden="true" />
        <strong>Meu computador</strong>
        <span>{pc.ligado ? `${pc.viaConector ? 'Conector' : 'Navegador'} · ${pc.pasta ?? 'conectado'}` : 'Não conectado · configurar'}</span>
      </button>
    </div>}
    acessos={salas.find(s => s.id === escritorio.id) ? <AcessosSala sala={salas.find(s => s.id === escritorio.id)!} perfil={perfil} /> : null}
    agentes={agentes} ocupados={ocupados} selecionado={aberto} pendentes={pendentes} mesa={mesa} erro={erro}
    onAgente={id => { setMesa(false); setAberto(id); }}
    onCriar={() => { if (pode(papel, 'editor')) { setEditando(null); setCriando(true); } }}
    onEditar={agente => { setCriando(false); setEditando(agente); }}
    onMesa={() => { setMesa(!mesa); setAberto(null); }}
    onFecharPainel={() => { setMesa(false); setAberto(null); }} onSair={() => void sair()}
    ponte={<button className={'ponte' + (ponteLigada ? ' ligada' : '')} onClick={() => { setErroPc(''); setComputador(true); }}>{ponteLigada ? `Conectado${pastaPonte ? ` · ${pastaPonte}` : ''}` : 'Abrir Meu computador'}</button>}
    painel={mesa ? <Mesa escritorioId={escritorio.id} podeOperar={pode(papel, 'operador')} onFechar={() => setMesa(false)} onMudou={setPendentes} /> : selecionado ?
      <AgentPanel key={selecionado.id} agente={selecionado} podeOperar={pode(papel, 'operador')} podeEditar={pode(papel, 'editor')} onFechar={() => setAberto(null)} onEditar={() => { setCriando(false); setEditando(selecionado); }} onExcluido={() => { const id = aberto; setAgentes(lista => lista.filter(a => a.id !== id)); setOcupados(atual => { const prox = new Set(atual); if (id) prox.delete(id); return prox; }); setEditando(atual => atual?.id === id ? null : atual); setAberto(null); }} /> : null}
    modal={computador ? <MeuComputador estado={pc} pastaAba={pastaPonte} pastaGuardada={pastaAntiga} ligando={ligando} podeOperar={!!minhaSala.current} navegadorOk={navegadorComPasta()} erro={erroPc}
      onLigar={nova => void ligar(nova)} onDesligar={() => void desligar()} onFechar={() => setComputador(false)} /> : (criando || editando) ? <AgentForm key={editando?.id ?? 'novo'} escritorioId={escritorio.id} agente={editando ?? undefined} coresUsadas={agentes.filter(a => a.id !== editando?.id).map(a => a.aparencia.cor)} onFechar={() => { setCriando(false); setEditando(null); }} onSalvo={() => { setCriando(false); setEditando(null); void carregarAgentes(escritorio.id); }} /> : null}
  />;
}
