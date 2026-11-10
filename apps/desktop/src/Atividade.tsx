import { useCallback, useEffect, useState } from 'react';
import { supabase, type Ficha, type Agente } from './supabase';
import { Icon } from './Icon';
export const ESTADOS: Record<Ficha['estado'], string> = { fila: 'Na fila', trabalhando: 'Em andamento', aguardando_aprovacao: 'Aguardando aprovação', entregue: 'Concluída', cancelada: 'Cancelada', erro: 'Com erro' };

export function Atividade({ escritorioId, agentes, onAgente }: { escritorioId: string; agentes: Agente[]; onAgente: (id: string) => void }) {
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [filtro, setFiltro] = useState('todas');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('fichas').select('id,titulo,pedido,estado,resultado,agente_atual,criado_em').eq('escritorio_id', escritorioId).order('criado_em', { ascending: false }).limit(100);
    if (error) setErro(error.message); else { setFichas((data ?? []) as Ficha[]); setErro(''); }
    setCarregando(false);
  }, [escritorioId]);
  useEffect(() => {
    void carregar();
    const canal = supabase.channel(`atividade-${escritorioId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'fichas', filter: `escritorio_id=eq.${escritorioId}` }, () => void carregar()).subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [escritorioId, carregar]);
  const visiveis = fichas.filter(f => filtro === 'todas' || f.estado === filtro);
  return <section className="pagina-workspace" aria-labelledby="titulo-atividade">
    <div className="pagina-titulo"><div><span className="sobretitulo">ACOMPANHAMENTO</span><h2 id="titulo-atividade">Tudo o que está acontecendo</h2><p className="mudo">As 100 tarefas mais recentes do escritório, atualizadas ao vivo.</p></div><Icon name="activity" size={32} /></div>
    <div className="filtros-atividade"><label htmlFor="estado-atividade">Estado da tarefa</label><select id="estado-atividade" value={filtro} onChange={e => setFiltro(e.target.value)}><option value="todas">Todas as tarefas</option>{Object.entries(ESTADOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select><button className="btn" onClick={() => void carregar()}>Atualizar</button></div>
    {erro && <p className="erro" role="alert">{erro}</p>}
    {carregando ? <p role="status">Carregando atividade…</p> : visiveis.length === 0 ? <div className="estado-vazio"><Icon name="activity" size={36} /><h3>Nenhuma tarefa por aqui</h3><p>As tarefas enviadas aos agentes aparecerão nesta área.</p></div> : <ol className="timeline">
      {visiveis.map(f => { const agente = agentes.find(a => a.id === f.agente_atual); return <li key={f.id}>
        <span className={`timeline-ponto ${f.estado}`} aria-hidden="true" />
        <div><div className="linha-acoes"><span className={`estado ${f.estado}`}>{ESTADOS[f.estado]}</span><time dateTime={f.criado_em}>{new Date(f.criado_em).toLocaleString('pt-BR')}</time></div>
          <h3>{f.titulo}</h3><p className="mudo">{agente?.nome ?? 'Sem agente responsável'}</p>
          <details><summary>Ver tarefa e resultado</summary><p className="pedido">{f.pedido}</p>{f.resultado && <div className="resultado">{f.resultado}</div>}</details>
          {agente && <button className="link" onClick={() => onAgente(agente.id)}>Abrir agente <span aria-hidden="true">↗</span></button>}
        </div></li>; })}
    </ol>}
  </section>;
}
