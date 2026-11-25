import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase, servidor, pode, type Agente, type Papel } from './supabase';
import { Icon } from './Icon';
import './agendas.css';

type Frequencia = 'intervalo' | 'diaria' | 'semanal' | 'mensal';
interface Agenda {
  id: string; agente_id: string; titulo: string; pedido: string; frequencia: Frequencia; intervalo_min: number | null; hora: string;
  dias_semana: number[]; dia_mes: number | null; fuso: string; lembrar_anterior: boolean; pular_se_ocupada: boolean; tolerancia_min: number;
  ativo: boolean; proxima_execucao: string | null; ultima_execucao: string | null; ultima_ficha: string | null; execucoes: number; falhas_seguidas: number; pausada_motivo: string | null;
}
interface Execucao { agenda_id: string; previsto_para: string; situacao: string; ficha_id: string | null }
const COLUNAS = 'id,agente_id,titulo,pedido,frequencia,intervalo_min,hora,dias_semana,dia_mes,fuso,lembrar_anterior,pular_se_ocupada,tolerancia_min,ativo,proxima_execucao,ultima_execucao,ultima_ficha,execucoes,falhas_seguidas,pausada_motivo';
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const SITUACAO: Record<string, string> = {
  criada: 'Rodou', manual: 'Rodou agora', pulada_ocupada: 'Pulada: a anterior ainda não terminou', pulada_atraso: 'Pulada: passou da tolerância de atraso',
  pulada_pausada: 'Pulada: sala pausada', pulada_agente_inativo: 'Pulada: agente desativado', pausada_erros: 'Pausada: erros seguidos', pausada_sem_permissao: 'Pausada: sem permissão',
};
const ESTADO_FICHA: Record<string, string> = { fila: 'na fila', trabalhando: 'em andamento', aguardando_aprovacao: 'aguardando aprovação', aguardando_computador: 'esperando o computador', entregue: 'concluída', cancelada: 'cancelada', erro: 'com erro' };

const fusoDoNavegador = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'; } catch { return 'America/Sao_Paulo'; } };
const quando = (iso: string | null, fuso: string) => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const minutos = (n: number) => n % 1440 === 0 ? (n === 1440 ? '1 dia' : `${n / 1440} dias`) : n % 60 === 0 ? (n === 60 ? '1 hora' : `${n / 60} horas`) : `${n} min`;

export function descreverFrequencia(a: Pick<Agenda, 'frequencia' | 'intervalo_min' | 'hora' | 'dias_semana' | 'dia_mes'>): string {
  const h = a.hora.slice(0, 5);
  if (a.frequencia === 'intervalo') return `A cada ${minutos(a.intervalo_min ?? 0)}`;
  if (a.frequencia === 'diaria') return `Todo dia às ${h}`;
  if (a.frequencia === 'semanal') {
    const d = [...a.dias_semana].sort((x, y) => x - y).map(i => DIAS[i - 1]);
    return `${d.length > 1 ? d.slice(0, -1).join(', ') + ' e ' + d[d.length - 1] : d[0]} às ${h}`;
  }
  return `Todo dia ${a.dia_mes} do mês às ${h}`;
}

const VAZIO = { id: '', agente_id: '', titulo: '', pedido: '', frequencia: 'diaria' as Frequencia, intervalo_min: 60, hora: '09:00', dias_semana: [1, 2, 3, 4, 5], dia_mes: 1, fuso: fusoDoNavegador(), lembrar_anterior: true, pular_se_ocupada: true, tolerancia_min: 120 };
type Rascunho = typeof VAZIO;

export function Agendas({ escritorioId, agentes, papel }: { escritorioId: string; agentes: Agente[]; papel: Papel | null }) {
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [estadoFichas, setEstadoFichas] = useState<Record<string, string>>({});
  const [form, setForm] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState(''), [aviso, setAviso] = useState('');
  const [carregando, setCarregando] = useState(true), [ocupado, setOcupado] = useState('');
  const [excluir, setExcluir] = useState<string | null>(null);
  const editor = pode(papel, 'editor'), operador = pode(papel, 'operador');

  const carregar = useCallback(async () => {
    const [a, e] = await Promise.all([
      supabase.from('agendas').select(COLUNAS).eq('escritorio_id', escritorioId).order('criado_em'),
      supabase.from('agendas_execucoes').select('agenda_id,previsto_para,situacao,ficha_id').eq('escritorio_id', escritorioId).order('previsto_para', { ascending: false }).limit(300),
    ]);
    if (a.error) setErro(a.error.message);
    else {
      const lista = (a.data ?? []) as unknown as Agenda[];
      setAgendas(lista); setErro('');
      const ids = [...new Set([...lista.map(x => x.ultima_ficha), ...((e.data ?? []) as Execucao[]).map(x => x.ficha_id)].filter((x): x is string => !!x))];
      if (ids.length) {
        const f = await supabase.from('fichas').select('id,estado').in('id', ids);
        setEstadoFichas(Object.fromEntries(((f.data ?? []) as { id: string; estado: string }[]).map(x => [x.id, x.estado])));
      }
    }
    if (!e.error) setExecucoes((e.data ?? []) as Execucao[]);
    setCarregando(false);
  }, [escritorioId]);
  useEffect(() => { void carregar(); const t = setInterval(() => void carregar(), 30_000); return () => clearInterval(t); }, [carregar]);

  const agente = (id: string) => agentes.find(x => x.id === id);
  const ativos = agentes.filter(a => a.ativo);

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    if (!form) return;
    setOcupado('salvar'); setErro(''); setAviso('');
    const campos = {
      agente_id: form.agente_id, titulo: form.titulo.trim() || 'Tarefa programada', pedido: form.pedido.trim(), frequencia: form.frequencia,
      intervalo_min: form.frequencia === 'intervalo' ? form.intervalo_min : null, hora: form.hora, dias_semana: form.dias_semana,
      dia_mes: form.frequencia === 'mensal' ? form.dia_mes : null, fuso: form.fuso, lembrar_anterior: form.lembrar_anterior,
      pular_se_ocupada: form.pular_se_ocupada, tolerancia_min: form.tolerancia_min,
    };
    const r = form.id
      ? await supabase.from('agendas').update(campos).eq('id', form.id)
      : await supabase.from('agendas').insert({ ...campos, escritorio_id: escritorioId });
    setOcupado('');
    if (r.error) { setErro(r.error.message); return; }
    setForm(null); setAviso(form.id ? 'Agenda atualizada.' : 'Agenda criada. Ela roda sozinha, mesmo com o site fechado.');
    await carregar();
  }
  async function alternar(a: Agenda) {
    setOcupado(a.id); setErro(''); setAviso('');
    const { error } = await supabase.from('agendas').update({ ativo: !a.ativo }).eq('id', a.id);
    if (error) setErro(error.message);
    setOcupado(''); await carregar();
  }
  async function rodarAgora(a: Agenda) {
    setOcupado(a.id); setErro(''); setAviso('');
    const { data, error } = await supabase.rpc('executar_agenda_agora', { agenda: a.id });
    if (error) setErro(error.message);
    else {
      setAviso('Tarefa enviada ao agente.');
      // Acelera: o despertador do banco pegaria em até 1 minuto.
      try { await servidor('/api/run', { method: 'POST', body: JSON.stringify({ fichaId: data }) }); } catch { /* a fila cobre */ }
    }
    setOcupado(''); await carregar();
  }
  async function apagar(id: string) {
    setOcupado(id); setErro('');
    const { error } = await supabase.from('agendas').delete().eq('id', id);
    if (error) setErro(error.message);
    setExcluir(null); setOcupado(''); await carregar();
  }
  const abrirNova = () => { setErro(''); setAviso(''); setForm({ ...VAZIO, agente_id: ativos[0]?.id ?? '' }); };
  const abrirEdicao = (a: Agenda) => { setErro(''); setAviso(''); setForm({ id: a.id, agente_id: a.agente_id, titulo: a.titulo, pedido: a.pedido, frequencia: a.frequencia, intervalo_min: a.intervalo_min ?? 60, hora: a.hora.slice(0, 5), dias_semana: a.dias_semana, dia_mes: a.dia_mes ?? 1, fuso: a.fuso, lembrar_anterior: a.lembrar_anterior, pular_se_ocupada: a.pular_se_ocupada, tolerancia_min: a.tolerancia_min }); };
  const mudar = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setForm(f => f ? { ...f, [k]: v } : f);
  const fusos = [...new Set([form?.fuso ?? fusoDoNavegador(), fusoDoNavegador(), 'America/Sao_Paulo', 'America/Manaus', 'America/Rio_Branco', 'America/Noronha', 'UTC'])];

  return <section className="pagina-workspace" aria-labelledby="titulo-agendas">
    <div className="pagina-titulo"><div><span className="sobretitulo">TRABALHO CONTÍNUO</span><h2 id="titulo-agendas">Tarefas programadas</h2><p className="mudo">Escolha o que cada agente faz e de quanto em quanto tempo. Elas rodam sozinhas, mesmo com o site fechado.</p></div><Icon name="calendar" size={32} /></div>
    {editor && !form && <div className="filtros-atividade"><button className="btn primario" onClick={abrirNova} disabled={!ativos.length}><Icon name="plus" size={18} />Nova tarefa programada</button>{!ativos.length && <span className="mudo">Crie ou ative um agente primeiro.</span>}</div>}
    {erro && <p className="erro" role="alert">{erro}</p>}
    {aviso && <p className="sucesso" role="status">{aviso}</p>}

    {form && <form className="form-agenda" onSubmit={salvar} aria-label={form.id ? 'Editar tarefa programada' : 'Nova tarefa programada'}>
      <div className="grade-form-agenda">
        <div><label htmlFor="ag-agente">Quem faz</label><select id="ag-agente" required value={form.agente_id} onChange={e => mudar('agente_id', e.target.value)}>{agentes.filter(a => a.ativo || a.id === form.agente_id).map(a => <option key={a.id} value={a.id}>{a.nome}{a.cargo ? ` · ${a.cargo}` : ''}</option>)}</select></div>
        <div><label htmlFor="ag-titulo">Nome da tarefa</label><input id="ag-titulo" maxLength={50} value={form.titulo} onChange={e => mudar('titulo', e.target.value)} placeholder="Ex.: Resumo diário de vendas" /></div>
      </div>
      <label htmlFor="ag-pedido">O que o agente deve fazer a cada vez</label>
      <textarea id="ag-pedido" required rows={4} maxLength={4500} value={form.pedido} onChange={e => mudar('pedido', e.target.value)} placeholder="Escreva como se estivesse pedindo a uma pessoa. Seja específico." />
      <div className="grade-form-agenda">
        <div><label htmlFor="ag-freq">Repetição</label><select id="ag-freq" value={form.frequencia} onChange={e => mudar('frequencia', e.target.value as Frequencia)}><option value="intervalo">De tempos em tempos</option><option value="diaria">Todo dia</option><option value="semanal">Em dias da semana</option><option value="mensal">Uma vez por mês</option></select></div>
        {form.frequencia === 'intervalo'
          ? <div><label htmlFor="ag-int">A cada (minutos, mínimo 5)</label><input id="ag-int" type="number" required min={5} max={10080} step={5} value={form.intervalo_min} onChange={e => mudar('intervalo_min', Number(e.target.value))} /></div>
          : <div><label htmlFor="ag-hora">Horário</label><input id="ag-hora" type="time" required value={form.hora} onChange={e => mudar('hora', e.target.value)} /></div>}
        {form.frequencia === 'mensal' && <div><label htmlFor="ag-dia">Dia do mês</label><input id="ag-dia" type="number" required min={1} max={31} value={form.dia_mes} onChange={e => mudar('dia_mes', Number(e.target.value))} /><p className="mudo">Em meses mais curtos roda no último dia.</p></div>}
        {form.frequencia !== 'intervalo' && <div><label htmlFor="ag-fuso">Fuso horário</label><select id="ag-fuso" value={form.fuso} onChange={e => mudar('fuso', e.target.value)}>{fusos.map(f => <option key={f}>{f}</option>)}</select></div>}
      </div>
      {form.frequencia === 'semanal' && <fieldset className="dias-semana"><legend>Dias</legend>{DIAS.map((d, i) => <label key={d} className="dia-opcao"><input type="checkbox" checked={form.dias_semana.includes(i + 1)} onChange={e => mudar('dias_semana', e.target.checked ? [...form.dias_semana, i + 1] : form.dias_semana.filter(x => x !== i + 1))} /><span>{d}</span></label>)}</fieldset>}
      <fieldset className="regras-agenda"><legend>Para ser consistente</legend>
        <label className="opcao"><input type="checkbox" checked={form.lembrar_anterior} onChange={e => mudar('lembrar_anterior', e.target.checked)} /><span>Continuar de onde parou: o agente recebe o resultado da execução anterior como contexto.</span></label>
        <label className="opcao"><input type="checkbox" checked={form.pular_se_ocupada} onChange={e => mudar('pular_se_ocupada', e.target.checked)} /><span>Não acumular: se a execução anterior ainda não terminou, pula esta.</span></label>
        <div className="tolerancia"><label htmlFor="ag-tol">Se o sistema ficar fora do ar, ainda recupera a execução atrasada até (minutos)</label><input id="ag-tol" type="number" min={0} max={1440} value={form.tolerancia_min} onChange={e => mudar('tolerancia_min', Number(e.target.value))} /></div>
      </fieldset>
      <div className="linha-acoes"><button type="button" className="btn" onClick={() => setForm(null)}>Cancelar</button><button className="btn primario" disabled={ocupado === 'salvar' || !form.pedido.trim() || !form.agente_id || (form.frequencia === 'semanal' && !form.dias_semana.length)}>{ocupado === 'salvar' ? 'Salvando…' : form.id ? 'Salvar alterações' : 'Criar tarefa programada'}</button></div>
    </form>}

    {carregando ? <p role="status">Carregando tarefas programadas…</p> : agendas.length === 0 && !form
      ? <div className="estado-vazio"><Icon name="calendar" size={40} /><h3>Nenhuma tarefa programada</h3><p>{editor ? 'Crie a primeira: por exemplo, um resumo diário às 9h ou uma checagem a cada hora.' : 'Quem edita o escritório pode criar tarefas programadas.'}</p></div>
      : <ul className="lista-agendas">{agendas.map(a => {
        const ag = agente(a.agente_id), ultima = a.ultima_ficha ? estadoFichas[a.ultima_ficha] : null;
        const hist = execucoes.filter(x => x.agenda_id === a.id).slice(0, 8);
        return <li key={a.id} className={'card-agenda' + (a.ativo ? '' : ' pausada')}>
          <div className="topo-agenda"><div><h3>{a.titulo}</h3><p className="mudo">{ag?.nome ?? 'Agente removido'} · {descreverFrequencia(a)}{a.frequencia !== 'intervalo' && a.fuso !== fusoDoNavegador() ? ` (${a.fuso})` : ''}</p></div><span className={'selo-agenda ' + (a.ativo ? 'ativa' : 'parada')}>{a.ativo ? 'Ativa' : 'Pausada'}</span></div>
          <p className="pedido">{a.pedido}</p>
          <dl className="fatos-agenda">
            <div><dt>Próxima</dt><dd>{a.ativo ? quando(a.proxima_execucao, a.fuso) : '—'}</dd></div>
            <div><dt>Última</dt><dd>{quando(a.ultima_execucao, a.fuso)}{ultima ? ` · ${ESTADO_FICHA[ultima] ?? ultima}` : ''}</dd></div>
            <div><dt>Execuções</dt><dd>{a.execucoes}</dd></div>
          </dl>
          {a.pausada_motivo && !a.ativo && <p className="erro" role="alert">{a.pausada_motivo}</p>}
          {a.falhas_seguidas > 0 && a.ativo && <p className="aviso-agenda">A última execução terminou com erro ({a.falhas_seguidas} seguida{a.falhas_seguidas > 1 ? 's' : ''}). Com 5, a agenda pausa sozinha.</p>}
          {hist.length > 0 && <details><summary>Histórico recente</summary><ol className="historico-agenda">{hist.map(h => <li key={h.previsto_para}><time dateTime={h.previsto_para}>{quando(h.previsto_para, a.fuso)}</time><span>{SITUACAO[h.situacao] ?? h.situacao}{h.ficha_id && estadoFichas[h.ficha_id] ? ` · ${ESTADO_FICHA[estadoFichas[h.ficha_id]] ?? ''}` : ''}</span></li>)}</ol></details>}
          {(operador || editor) && <div className="linha-acoes">
            {operador && <button className="btn pequeno" disabled={!!ocupado} onClick={() => void rodarAgora(a)}>Rodar agora</button>}
            {editor && <button className="btn pequeno" disabled={!!ocupado} onClick={() => void alternar(a)}>{a.ativo ? 'Pausar' : 'Reativar'}</button>}
            {editor && <button className="btn pequeno" disabled={!!ocupado} onClick={() => abrirEdicao(a)}>Editar</button>}
            {editor && (excluir === a.id
              ? <><button className="btn pequeno perigo" disabled={!!ocupado} onClick={() => void apagar(a.id)}>Confirmar exclusão</button><button className="btn pequeno" onClick={() => setExcluir(null)}>Manter</button></>
              : <button className="btn pequeno perigo" disabled={!!ocupado} onClick={() => setExcluir(a.id)}>Excluir</button>)}
          </div>}
        </li>;
      })}</ul>}
  </section>;
}
