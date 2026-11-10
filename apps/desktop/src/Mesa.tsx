import { useCallback, useEffect, useState } from 'react';
import { supabase, servidor } from './supabase';

interface Pedido {
  id: string; criado_em: string;
  pedido: { ferramenta?: string; args?: Record<string, unknown> };
  fichas: { titulo: string } | null; agentes: { nome: string } | null;
}
const ACAO: Record<string, string> = { buscar_url: 'quer ler uma página da internet', pedir_aprovacao: 'pede a sua decisão', listar_arquivos: 'quer ver os arquivos de uma pasta do computador', ler_arquivo: 'quer ler um arquivo do computador', escrever_arquivo: 'quer gravar um arquivo no computador' };
function detalhe(p: Pedido['pedido']): string {
  const a = p.args ?? {};
  if (p.ferramenta === 'pedir_aprovacao') return String(a.resumo ?? '');
  if (p.ferramenta === 'buscar_url') return String(a.url ?? '');
  if (p.ferramenta === 'listar_arquivos') return `Pasta: ${String(a.pasta || '(raiz da pasta de trabalho)')}`;
  if (p.ferramenta === 'ler_arquivo') return `Arquivo: ${String(a.caminho ?? '')}`;
  if (p.ferramenta === 'escrever_arquivo') return `Arquivo: ${String(a.caminho ?? '')}\n\nConteúdo:\n${String(a.conteudo ?? '').slice(0, 4000)}`;
  return JSON.stringify(a, null, 2);
}

// Sua mesa: os pedidos de aprovação que os agentes mandaram para o time.
export function Mesa({ escritorioId, podeOperar, onFechar, onMudou }: { escritorioId: string; podeOperar: boolean; onFechar: () => void; onMudou: (n: number) => void }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('aprovacoes').select('id, criado_em, pedido, fichas(titulo), agentes(nome)')
      .eq('escritorio_id', escritorioId).eq('estado', 'pendente').order('criado_em');
    if (error) { setErro(error.message); return; }
    const lista = (data ?? []) as unknown as Pedido[];
    setPedidos(lista); onMudou(lista.length);
  }, [escritorioId, onMudou]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const canal = supabase.channel(`mesa-${escritorioId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aprovacoes', filter: `escritorio_id=eq.${escritorioId}` }, () => carregar())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [escritorioId, carregar]);

  async function decidir(id: string, decisao: 'aprovada' | 'recusada') {
    setOcupado(id); setErro('');
    try { await servidor('/api/decidir', { method: 'POST', body: JSON.stringify({ aprovacaoId: id, decisao, comentario: notas[id] || '' }) }); }
    catch (e) { setErro((e as Error).message); }
    setOcupado(null); carregar();
  }

  return (
    <aside className="painel" aria-label="Sua mesa">
      <div className="painel-topo">
        <div><h2>Sua mesa</h2><p className="mudo">Pedidos que os agentes mandaram para aprovação.</p></div>
        <button className="btn pequeno" onClick={onFechar}>Fechar</button>
      </div>
      {erro && <p className="erro" role="alert">{erro}</p>}
      {pedidos.length === 0 && <p className="mudo">Nada esperando decisão.</p>}
      <ul className="fichas">
        {pedidos.map(p => (
          <li key={p.id} className="pedido-mesa">
            <p><strong>{p.agentes?.nome ?? 'Um agente'}</strong> {ACAO[p.pedido.ferramenta ?? ''] ?? `quer usar ${p.pedido.ferramenta}`}</p>
            <p className="mudo">Ficha: {p.fichas?.titulo ?? 'sem título'}</p>
            <pre className="args">{detalhe(p.pedido)}</pre>
            {podeOperar ? (
              <>
                <label htmlFor={`n-${p.id}`}>Comentário para o agente (opcional)</label>
                <input id={`n-${p.id}`} maxLength={600} value={notas[p.id] ?? ''} onChange={e => setNotas({ ...notas, [p.id]: e.target.value })} />
                <div className="acoes">
                  <button className="btn primario pequeno" disabled={ocupado === p.id} onClick={() => decidir(p.id, 'aprovada')}>Aprovar</button>
                  <button className="btn pequeno" disabled={ocupado === p.id} onClick={() => decidir(p.id, 'recusada')}>Recusar</button>
                </div>
              </>
            ) : <p className="mudo">Seu papel permite ver, mas não decidir.</p>}
          </li>
        ))}
      </ul>
    </aside>
  );
}
