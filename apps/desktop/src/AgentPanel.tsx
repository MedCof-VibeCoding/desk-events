import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase, servidor, type Agente, type Ficha } from './supabase';

const ESTADO: Record<string, string> = { fila: 'Na fila', trabalhando: 'Trabalhando', aguardando_aprovacao: 'Aguardando aprovação', entregue: 'Entregue', cancelada: 'Cancelada', erro: 'Erro' };

export function AgentPanel({ agente, podeOperar, onFechar }: { agente: Agente; podeOperar: boolean; onFechar: () => void }) {
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [pedido, setPedido] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('fichas').select('id, titulo, pedido, estado, resultado, agente_atual, criado_em')
      .eq('agente_atual', agente.id).order('criado_em', { ascending: false }).limit(20);
    if (error) setErro(error.message); else setFichas((data ?? []) as Ficha[]);
  }, [agente.id]);

  useEffect(() => { setFichas([]); setErro(''); carregar(); }, [carregar]);

  // Ao vivo: a ficha muda de estado sozinha quando o agente termina.
  useEffect(() => {
    const canal = supabase.channel(`fichas-${agente.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fichas', filter: `agente_atual=eq.${agente.id}` }, () => carregar())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [agente.id, carregar]);

  async function mandar(e: FormEvent) {
    e.preventDefault();
    const texto = pedido.trim();
    if (!texto) return;
    setEnviando(true); setErro('');
    const titulo = texto.split('\n')[0].slice(0, 70);
    const { data, error } = await supabase.from('fichas').insert({ escritorio_id: agente.escritorio_id, titulo, pedido: texto, agente_atual: agente.id }).select('id').single();
    if (error || !data) { setErro(error?.message || 'Não foi possível criar a ficha.'); setEnviando(false); return; }
    setPedido('');
    await carregar();
    try { await servidor('/api/run', { method: 'POST', body: JSON.stringify({ fichaId: data.id }) }); }
    catch (x) { setErro((x as Error).message); }
    await carregar();
    setEnviando(false);
  }

  return (
    <aside className="painel" aria-label={`Tarefas de ${agente.nome}`}>
      <div className="painel-topo">
        <div><h2>{agente.nome}</h2><p className="mudo">{agente.cargo || 'Sem cargo definido'}</p></div>
        <button className="btn pequeno" onClick={onFechar}>Fechar</button>
      </div>
      {podeOperar ? (
        <form onSubmit={mandar}>
          <label htmlFor="pedido">Nova tarefa</label>
          <textarea id="pedido" rows={4} maxLength={8000} value={pedido} onChange={e => setPedido(e.target.value)} placeholder={`O que ${agente.nome} deve fazer?`} />
          <button className="btn primario" disabled={enviando || !pedido.trim()}>{enviando ? `${agente.nome} está trabalhando…` : 'Mandar tarefa'}</button>
        </form>
      ) : <p className="mudo">Seu papel permite acompanhar, mas não mandar tarefas.</p>}
      {erro && <p className="erro" role="alert">{erro}</p>}
      <h3>Fichas</h3>
      {fichas.length === 0 && <p className="mudo">Nenhuma ficha ainda.</p>}
      <ul className="fichas">
        {fichas.map(f => (
          <li key={f.id}>
            <details open={f === fichas[0]}>
              <summary><span className={`estado ${f.estado}`}>{ESTADO[f.estado]}</span> {f.titulo}</summary>
              <p className="pedido">{f.pedido}</p>
              {f.resultado && <div className={f.estado === 'erro' ? 'resultado erro' : 'resultado'}>{f.resultado}</div>}
            </details>
          </li>
        ))}
      </ul>
    </aside>
  );
}
