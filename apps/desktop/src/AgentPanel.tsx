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

  // Recoloca na fila uma ficha parada ou com erro e chama o agente de novo.
  async function tentar(f: Ficha) {
    setEnviando(true); setErro('');
    const { error } = await supabase.from('fichas').update({ estado: 'fila', resultado: null }).eq('id', f.id);
    if (error) setErro(error.message);
    else { try { await servidor('/api/run', { method: 'POST', body: JSON.stringify({ fichaId: f.id }) }); } catch (x) { setErro((x as Error).message); } }
    await carregar(); setEnviando(false);
  }
  async function cancelar(f: Ficha) {
    const { error } = await supabase.from('fichas').update({ estado: 'cancelada' }).eq('id', f.id);
    if (error) setErro(error.message);
    carregar();
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
              <Passos fichaId={f.id} />
              {f.resultado && <div className={f.estado === 'erro' ? 'resultado erro' : 'resultado'}>{f.resultado}</div>}
              {podeOperar && ['fila', 'erro', 'trabalhando'].includes(f.estado) && (
                <div className="linha-acoes">
                  {f.estado !== 'trabalhando' && <button className="btn pequeno" disabled={enviando} onClick={() => tentar(f)}>Tentar de novo</button>}
                  <button className="btn pequeno" disabled={enviando} onClick={() => cancelar(f)}>Cancelar ficha</button>
                </div>
              )}
            </details>
          </li>
        ))}
      </ul>
    </aside>
  );
}

interface Passo { id: number; tipo: string; conteudo: { msg?: { role: string; texto?: string; chamadas?: { id: string; nome: string; args: Record<string, unknown> }[]; id?: string; nome?: string; resultado?: string }; de?: string; para?: string; mensagem?: string; erro?: string; aviso?: string }; agentes: { nome: string } | null }
const FEITO: Record<string, string> = { buscar_url: 'Leu a página', pedir_aprovacao: 'Pediu aprovação', listar_arquivos: 'Listou a pasta', ler_arquivo: 'Leu o arquivo', escrever_arquivo: 'Gravou o arquivo' };
const QUER: Record<string, string> = { buscar_url: 'Quer ler a página', pedir_aprovacao: 'Pediu aprovação', listar_arquivos: 'Quer listar a pasta', ler_arquivo: 'Quer ler o arquivo', escrever_arquivo: 'Quer gravar o arquivo' };

// O que o agente fez nesta ficha, passo a passo, atualizado ao vivo.
function Passos({ fichaId }: { fichaId: string }) {
  const [passos, setPassos] = useState<Passo[]>([]);
  const carregar = useCallback(async () => {
    const { data } = await supabase.from('passos').select('id, tipo, conteudo, agentes(nome)').eq('ficha_id', fichaId).order('id');
    setPassos((data ?? []) as unknown as Passo[]);
  }, [fichaId]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const canal = supabase.channel(`passos-${fichaId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'passos', filter: `ficha_id=eq.${fichaId}` }, () => carregar())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [fichaId, carregar]);

  const respondidas = new Set(passos.map(p => (p.conteudo.msg as { id?: string } | undefined)?.id).filter(Boolean));
  const linhas: { id: string; quem: string; texto: string }[] = [];
  for (const p of passos) {
    const quem = p.agentes?.nome ?? 'Escritório', m = p.conteudo.msg;
    if (p.tipo === 'repasse') linhas.push({ id: `${p.id}`, quem: p.conteudo.de ?? quem, texto: `Passou a ficha para ${p.conteudo.para}: ${p.conteudo.mensagem}` });
    else if (p.tipo === 'sistema') linhas.push({ id: `${p.id}`, quem: 'Escritório', texto: p.conteudo.erro ?? p.conteudo.aviso ?? '' });
    else if (m?.role === 'assistant') {
      (m.chamadas ?? []).forEach((c, i) => {
        if (c.nome === 'passar_ficha') return; // o repasse já aparece na linha própria
        const alvo = String(c.args.url ?? c.args.caminho ?? c.args.pasta ?? c.args.resumo ?? '');
        const rotulo = (respondidas.has(c.id) ? FEITO : QUER)[c.nome] ?? c.nome;
        linhas.push({ id: `${p.id}-${i}`, quem, texto: alvo ? `${rotulo}: ${alvo}` : rotulo });
      });
    } else if (m?.role === 'tool' && m.nome === 'pedir_aprovacao') linhas.push({ id: `${p.id}`, quem: 'Decisão', texto: (m.resultado ?? '').slice(0, 240) });
  }
  if (!linhas.length) return null;
  return <ol className="passos">{linhas.map(l => <li key={l.id}><strong>{l.quem}</strong> {l.texto}</li>)}</ol>;
}
