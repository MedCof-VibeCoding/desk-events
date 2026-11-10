import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, pode, type Agente, type Escritorio, type Papel } from './supabase';
import { Workspace } from './Workspace';
import { AgentForm } from './AgentForm';
import { AgentPanel } from './AgentPanel';
import { Mesa } from './Mesa';
import { SINAL_PONTE_MS, desligarPonte, ligarPonte, navegadorComPasta } from './ponteLocal';


export function Office({ session }: { session: Session }) {
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

  const carregarAgentes = useCallback(async (escId: string) => {
    const { data, error } = await supabase.from('agentes').select('*').eq('escritorio_id', escId).order('criado_em');
    if (error) setErro(error.message); else setAgentes((data ?? []) as Agente[]);
  }, []);

  // Agentes com ficha na fila ou em andamento: é o que faz o robô ir para a mesa.
  const carregarOcupados = useCallback(async (escId: string) => {
    const { data } = await supabase.from('fichas').select('agente_atual').eq('escritorio_id', escId).in('estado', ['fila', 'trabalhando']);
    setOcupados(new Set((data ?? []).map(f => f.agente_atual as string).filter(Boolean)));
  }, []);

  const contarPendentes = useCallback(async (escId: string) => {
    const { count } = await supabase.from('aprovacoes').select('id', { count: 'exact', head: true }).eq('escritorio_id', escId).eq('estado', 'pendente');
    setPendentes(count ?? 0);
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    const { data, error } = await supabase.from('membros').select('papel, escritorios(id, nome, pausado)').eq('user_id', session.user.id).limit(1);
    if (error) { setErro(error.message); setCarregando(false); return; }
    const linha = data?.[0] as unknown as { papel: Papel; escritorios: Escritorio } | undefined;
    if (linha?.escritorios) { setEscritorio(linha.escritorios); setPapel(linha.papel); await carregarAgentes(linha.escritorios.id); await carregarOcupados(linha.escritorios.id); await contarPendentes(linha.escritorios.id); }
    setCarregando(false);
  }, [session.user.id, carregarAgentes, carregarOcupados, contarPendentes]);

  useEffect(() => { carregar(); }, [carregar]);

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
    const { error } = await supabase.from('escritorios').insert({ nome: nomeNovo.trim() });
    if (error) setErro(error.message); else { setNomeNovo(''); carregar(); }
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
    agentes={agentes} ocupados={ocupados} selecionado={aberto} pendentes={pendentes} mesa={mesa} erro={erro}
    onAgente={id => { setMesa(false); setAberto(id); }}
    onCriar={() => { setEditando(null); setCriando(true); }}
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
