import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, pode, type Agente, type Escritorio, type Papel } from './supabase';
import { Office3D } from './Office3D';
import { AgentForm } from './AgentForm';
import { AgentPanel } from './AgentPanel';

const PROVEDOR: Record<string, string> = { anthropic: 'Claude', openai: 'ChatGPT', google: 'Gemini' };

export function Office({ session }: { session: Session }) {
  const [escritorio, setEscritorio] = useState<Escritorio | null>(null);
  const [papel, setPapel] = useState<Papel | null>(null);
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [nomeNovo, setNomeNovo] = useState('');
  const [criando, setCriando] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());

  const carregarAgentes = useCallback(async (escId: string) => {
    const { data, error } = await supabase.from('agentes').select('*').eq('escritorio_id', escId).order('criado_em');
    if (error) setErro(error.message); else setAgentes((data ?? []) as Agente[]);
  }, []);

  // Agentes com ficha na fila ou em andamento: é o que faz o robô ir para a mesa.
  const carregarOcupados = useCallback(async (escId: string) => {
    const { data } = await supabase.from('fichas').select('agente_atual').eq('escritorio_id', escId).in('estado', ['fila', 'trabalhando']);
    setOcupados(new Set((data ?? []).map(f => f.agente_atual as string).filter(Boolean)));
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    const { data, error } = await supabase.from('membros').select('papel, escritorios(id, nome, pausado)').eq('user_id', session.user.id).limit(1);
    if (error) { setErro(error.message); setCarregando(false); return; }
    const linha = data?.[0] as unknown as { papel: Papel; escritorios: Escritorio } | undefined;
    if (linha?.escritorios) { setEscritorio(linha.escritorios); setPapel(linha.papel); await carregarAgentes(linha.escritorios.id); await carregarOcupados(linha.escritorios.id); }
    setCarregando(false);
  }, [session.user.id, carregarAgentes, carregarOcupados]);

  useEffect(() => { carregar(); }, [carregar]);

  // Ao vivo: qualquer mudança nos agentes do escritório aparece para todo o time.
  useEffect(() => {
    if (!escritorio) return;
    const canal = supabase.channel(`agentes-${escritorio.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agentes', filter: `escritorio_id=eq.${escritorio.id}` }, () => carregarAgentes(escritorio.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fichas', filter: `escritorio_id=eq.${escritorio.id}` }, () => carregarOcupados(escritorio.id))
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [escritorio, carregarAgentes, carregarOcupados]);

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

  return (
    <div className={'app' + (aberto ? ' com-painel' : '')}>
      <header className="topo">
        <div>
          <h1>{escritorio.nome}</h1>
          <p className="mudo">{session.user.email} · papel: {papel}</p>
        </div>
        <div className="acoes">
          {pode(papel, 'editor') && <button className="btn primario" onClick={() => setCriando(true)}>Criar agente</button>}
          <button className="btn" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>
      {erro && <p className="erro" role="alert">{erro}</p>}
      <section className="sala" aria-label="Escritório">
        <Office3D agentes={agentes} ocupados={ocupados} selecionado={aberto} onEscolher={id => setAberto(aberto === id ? null : id)} />
        {agentes.length === 0 ? (
          <p className="vazio">O escritório está vazio. {pode(papel, 'editor') ? 'Crie o primeiro agente para ele ocupar uma mesa.' : 'Peça a um editor para criar o primeiro agente.'}</p>
        ) : (
          <ul className="elenco" aria-label="Agentes">
            {agentes.map(a => (
              <li key={a.id}>
                <button className={'ficha-agente' + (aberto === a.id ? ' ativa' : '')} onClick={() => setAberto(aberto === a.id ? null : a.id)}>
                  <span className="ponto" style={{ background: a.aparencia.cor }} />
                  <span className="nome">{a.nome}</span>
                  <span className="mudo">{ocupados.has(a.id) ? 'Trabalhando' : a.ativo ? 'Livre' : 'Desativado'} · {PROVEDOR[a.provedor]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {aberto && agentes.find(a => a.id === aberto) && (
        <AgentPanel agente={agentes.find(a => a.id === aberto)!} podeOperar={pode(papel, 'operador')} onFechar={() => setAberto(null)} />
      )}
      {criando && <AgentForm escritorioId={escritorio.id} onFechar={() => setCriando(false)} onCriado={() => { setCriando(false); carregarAgentes(escritorio.id); }} />}
    </div>
  );
}
