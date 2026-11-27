import { lazy, Suspense, useState, type ReactNode } from 'react';
import { type Agente, type Escritorio, type Papel, pode } from './supabase';
import { Robot } from './Robot';
import { MarcaIcone } from './MarcaIcone';
import { Icon, type IconName } from './Icon';
import { Atividade } from './Atividade';
import { Agendas } from './Agendas';
import { ChatEquipe } from './ChatEquipe';
import { Reunioes } from './Reunioes';
import { usePreferencias } from './preferencias';
import { PIXEL_PERSONAGENS } from './pixelCatalogo';
import { MeuAvatar } from './MeuAvatar';
import type { Perfil } from './social';
import type { useSalaSocial } from './useSalaSocial';
import { Cafe } from './Cafe';
import './workspace.css';
import { useAmbiente } from './useAmbiente';
import { EditorAmbiente } from './EditorAmbiente';
import { moverItem, estiloDe, tamanhoDe } from './ambientes';
import type { PedidoVisita, SalaVitrine } from './visitas';
import { PedidosVisita } from './PedidosVisita';
const Office3D = lazy(() => import('./Office3D').then(m => ({ default: m.Office3D })));
type Pagina = 'cafe' | 'escritorio' | 'agentes' | 'atividade' | 'agendas' | 'chat' | 'reunioes' | 'preferencias';
const NAV: { id: Pagina; nome: string; icon: IconName }[] = [
  { id: 'escritorio', nome: 'Escritório', icon: 'office' }, { id: 'agentes', nome: 'Agentes', icon: 'team' },
  { id: 'atividade', nome: 'Atividade', icon: 'activity' }, { id: 'agendas', nome: 'Tarefas programadas', icon: 'calendar' }, { id: 'chat', nome: 'Chat da equipe', icon: 'chat' },
];
interface Props {
  perfil?: Perfil; social?: ReturnType<typeof useSalaSocial>; salasControle?: ReactNode; acessos?: ReactNode;
  vitrine?: SalaVitrine[]; onEntrarSala?: (id: string) => void; onPedirVisita?: (id: string) => void;
  pedidos?: PedidoVisita[]; onDecidirVisita?: (id: string, aceitar: boolean) => void; erroVisitas?: string;
  escritorio: Escritorio; papel: Papel | null; userId: string; email: string; agentes: Agente[]; ocupados: Set<string>;
  selecionado: string | null; pendentes: number; mesa: boolean; ponte: ReactNode; painel: ReactNode; modal: ReactNode; erro: string;
  onAgente: (id: string) => void; onCriar: () => void; onEditar: (agente: Agente) => void; onMesa: () => void; onFecharPainel: () => void; onSair: () => void;
}
export function Workspace(p: Props) {
  const compacta = !!p.escritorio.pessoal;
  const decoracao = useAmbiente(p.escritorio.id, compacta);
  const [movelSelecionado,setMovelSelecionado]=useState<string|null>(null);
  const [avisoDecoracao,setAvisoDecoracao]=useState('');
  const [decoracaoSalva,setDecoracaoSalva]=useState(false);
  const [editandoAparencia,setEditandoAparencia]=useState(false);
  const podeDecorar=pode(p.papel,'editor');
  function moverMovel(id:string,x:number,z:number) { const a=decoracao.rascunho;if(!a||!podeDecorar||decoracao.salvando)return;const item=a.itens.find(i=>i.id===id);if(!item)return;const novo={...item,x,z};const resultado=moverItem(a,novo,tamanhoDe(compacta));setAvisoDecoracao(resultado.erro??'');if(resultado.ambiente)decoracao.setRascunho(resultado.ambiente); }
  const [pagina, setPagina] = useState<Pagina>('escritorio');
  const [busca, setBusca] = useState(''), [filtro, setFiltro] = useState('todos');
  const [foco, setFoco] = useState(false);
  const [prefs, setPrefs] = usePreferencias(p.userId);
  const nome = p.perfil?.nome || p.email.split('@')[0] || 'Você';
  const ativos = p.agentes.filter(a => a.ativo).length;
  const trabalhando = p.agentes.filter(a => a.ativo && p.ocupados.has(a.id)).length;
  const estado = (a: Agente) => !a.ativo ? 'inativo' : p.ocupados.has(a.id) ? 'trabalhando' : 'disponivel';
  const rotulo = (a: Agente) => ({ inativo: 'Desativado', trabalhando: 'Trabalhando', disponivel: 'Disponível' }[estado(a)]);
  const termo = busca.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const encontrados = p.agentes.filter(a => `${a.nome} ${a.cargo}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(termo) && (filtro === 'todos' || estado(a) === filtro));
  function navegar(v: Pagina) {
    if (v === 'cafe' && p.social) { setPagina('escritorio'); void p.social.ir('cafe'); }
    else if (v === 'reunioes' && p.social) { setPagina('escritorio'); void p.social.ir('reuniao'); }
    else { setPagina(v); if (v === 'escritorio' && p.social) void p.social.ir('geral'); }
    p.onFecharPainel();
  }
  const grade = (completa: boolean) => <>
    <div className="busca-agentes"><div className="campo-busca"><Icon name="search" /><label className="so-leitor" htmlFor="buscar-agente">Buscar agente por nome ou cargo</label><input id="buscar-agente" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou especialidade…" /></div><label className="so-leitor" htmlFor="filtrar-agente">Disponibilidade dos agentes</label><select id="filtrar-agente" value={filtro} onChange={e => setFiltro(e.target.value)}><option value="todos">Todos os agentes</option><option value="disponivel">Disponíveis</option><option value="trabalhando">Trabalhando</option><option value="inativo">Desativados</option></select></div>
    {encontrados.length ? <ul className={'grade-agentes' + (completa ? ' completa' : '')}>{encontrados.map(a => <li key={a.id}><button className={'card-agente' + (p.selecionado === a.id ? ' escolhido' : '')} onClick={() => p.onAgente(a.id)} aria-pressed={p.selecionado === a.id}>
      <span className={'disponibilidade ' + estado(a)}><i />{rotulo(a)}</span><div className="retrato-agente"><Robot aparencia={a.aparencia} ativo={a.ativo} tamanho={completa ? 130 : 88} /></div><strong>{a.nome}</strong><span className="cargo-agente">{a.cargo || 'Agente do escritório'}</span><span className="abrir-agente">Ver tarefas <Icon name="arrow" size={16} /></span>
    </button></li>)}</ul> : <div className="estado-vazio"><Icon name="team" size={40} /><h3>{p.agentes.length ? 'Nenhum agente encontrado' : 'Seu time começa aqui'}</h3><p>{p.agentes.length ? 'Experimente outro nome ou filtro.' : 'Adicione um agente, escolha seu personagem e defina o que ele faz.'}</p>{!p.agentes.length && pode(p.papel, 'editor') && <button className="btn primario" onClick={p.onCriar}><Icon name="plus" />Criar primeiro agente</button>}</div>}
  </>;
  return <div className={'workspace' + (p.painel ? ' tem-painel' : '') + (foco ? ' modo-foco' : '')} data-tema={prefs.tema}>
    <a className="pular-conteudo" href="#conteudo-workspace">Pular para o conteúdo</a>
    <aside className="sidebar-workspace" aria-label="Navegação do escritório">
      <button className="marca-workspace" onClick={() => navegar('escritorio')} aria-label="DeskCof — abrir escritório"><span className="marca-simbolo"><MarcaIcone /></span><span>DeskCof<small>SEU ESPAÇO DE TRABALHO</small></span></button>
      {p.salasControle}
      <div className="nome-workspace"><span className="avatar-inicial">{p.escritorio.nome.slice(0, 1).toUpperCase()}</span><div><strong>{p.escritorio.nome}</strong><span>{ativos} agentes ativos</span></div></div>
      <nav className="nav-workspace"><span className="sobretitulo">ESPAÇO DE TRABALHO</span>{NAV.map(n => <button key={n.id} className={pagina === n.id && !p.mesa ? 'ativo' : ''} aria-current={pagina === n.id && !p.mesa ? 'page' : undefined} onClick={() => navegar(n.id)}><Icon name={n.icon} /><span>{n.nome}</span>{n.id === 'agentes' && <span className="nav-contador">{p.agentes.length}</span>}</button>)}
        <button className={p.mesa ? 'ativo' : ''} aria-expanded={p.mesa} onClick={p.onMesa}><Icon name="inbox" /><span>Sua mesa</span>{p.pendentes > 0 && <span className="nav-contador pendente">{p.pendentes}</span>}</button>
      </nav>
      <div className="sidebar-time"><div className="linha-titulo"><span className="sobretitulo">NO ESCRITÓRIO</span><span>{ativos}</span></div>{p.agentes.slice(0, 6).map(a => <button key={a.id} onClick={() => p.onAgente(a.id)} className="agente-rapido"><Robot aparencia={a.aparencia} tamanho={32} ativo={a.ativo} /><span><strong>{a.nome}</strong><small>{rotulo(a)}</small></span><i className={'ponto-status ' + estado(a)} /></button>)}{p.agentes.length > 6 && <button className="link" onClick={() => navegar('agentes')}>Ver todos os agentes</button>}</div>
      <div className="sidebar-rodape"><button className={'config-workspace' + (pagina === 'preferencias' ? ' ativo' : '')} onClick={() => navegar('preferencias')} aria-current={pagina === 'preferencias' ? 'page' : undefined}><Icon name="settings" />Personalizar</button><div className="perfil-workspace"><span className="avatar-inicial">{nome.slice(0,1).toUpperCase()}</span><div><strong>{nome}</strong><small>{p.perfil?.admin_geral ? 'Admin geral' : p.papel === 'dono' ? 'Dono da sala' : p.papel === 'editor' ? 'Editor' : p.papel === 'operador' ? 'Operador' : 'Leitura'}</small>{p.perfil && <button type="button" className="link" onClick={() => setEditandoAparencia(true)}>Alterar aparência</button>}</div><button className="botao-icone" onClick={p.onSair} title="Sair da conta" aria-label="Sair da conta"><Icon name="exit" size={18} /></button></div></div>
    </aside>
    <div className="corpo-workspace">
      <header className="cabecalho-workspace"><div className="breadcrumb"><span>{p.escritorio.nome}</span><span aria-hidden="true">/</span><strong>{pagina === 'preferencias' ? 'Personalizar' : NAV.find(n => n.id === pagina)?.nome}</strong></div><div className="acoes-cabecalho"><span className="indicador-ativos"><i />{trabalhando} trabalhando</span><button className={'botao-icone' + (foco ? ' ativo' : '')} title="Modo foco: recolhe a navegação" aria-label="Modo foco" aria-pressed={foco} onClick={() => setFoco(!foco)}><Icon name="focus" /></button>{pode(p.papel, 'editor') && <button className="btn primario" onClick={p.onCriar}><Icon name="plus" size={18} /><span>Novo agente</span></button>}</div></header>
      <main id="conteudo-workspace" className="conteudo-workspace" tabIndex={-1}>
        {p.social?.erro && <p className="erro erro-workspace" role="alert">{p.social.erro}</p>}
        {p.erro && <p className="erro erro-workspace" role="alert">{p.erro}</p>}
        {p.erroVisitas && <p className="erro erro-workspace" role="alert">{p.erroVisitas}</p>}
        {pagina === 'escritorio' && <section className="pagina-escritorio" aria-labelledby="titulo-escritorio"><div className="boas-vindas"><div><span className="sobretitulo">UM ESPAÇO PARA FAZER ACONTECER</span><h1 id="titulo-escritorio">Seu time, no mesmo lugar.</h1><p className="mudo">Acompanhe seus agentes e transforme ideias em entregas.</p></div><div className="segmentos" role="group" aria-label="Visualização do escritório"><button aria-pressed={prefs.vista === 'mapa'} onClick={() => setPrefs({ ...prefs, vista: 'mapa' })}><Icon name="office" size={17} />Escritório</button><button aria-pressed={prefs.vista === 'grade'} onClick={() => setPrefs({ ...prefs, vista: 'grade' })}><Icon name="grid" size={17} />Simplificada</button></div></div>
          {!!p.escritorio.principal && p.pedidos && p.onDecidirVisita && <PedidosVisita pedidos={p.pedidos} onDecidir={p.onDecidirVisita} aviso="Há pedidos para visitar a sua sala. Quem você aceitar entra como visitante." />}
          <div className="resumo-escritorio"><span><i className="ponto-status disponivel" />{ativos - trabalhando} disponíveis</span><span><i className="ponto-status trabalhando" />{trabalhando} em tarefa</span><button onClick={p.onMesa}><Icon name="inbox" size={16} />{p.pendentes} aprovações pendentes</button></div>
          {(prefs.vista === 'mapa' || p.social?.zona !== 'geral' && p.social) ? <><div className="decoracao-acoes"><span className="mudo">Ambiente {estiloDe(decoracao.ambiente.estilo).nome}</span>{podeDecorar && !decoracao.rascunho && <button className="btn pequeno" disabled={decoracao.carregando} onClick={()=>{decoracao.editar();setDecoracaoSalva(false);setAvisoDecoracao('');}}>Decorar escritório</button>}{decoracaoSalva && <span role="status">Decoração salva para todos na sala.</span>}</div>{decoracao.erro && <p className="erro" role="alert">{decoracao.erro} <button className="link" onClick={()=>void decoracao.recarregar()}>Tentar novamente</button></p>}{avisoDecoracao && <p className="erro" role="status">{avisoDecoracao}</p>}<div className={'sala-personalizavel'+(decoracao.rascunho&&podeDecorar?' editando':'')}><div><Suspense fallback={<div className="estado-vazio" role="status">Preparando o escritório…</div>}><Office3D ambiente={decoracao.ambiente} compacta={compacta} principal={!!p.escritorio.principal} vitrine={p.vitrine} onEntrar={p.onEntrarSala} onPedir={p.onPedirVisita} editandoAmbiente={!!decoracao.rascunho && podeDecorar && !decoracao.salvando} movelSelecionado={movelSelecionado} onMovel={setMovelSelecionado} onMoverMovel={moverMovel} pessoas={p.social?.pessoas} baloes={p.social?.baloes} userId={p.userId} zona={p.social?.zona} onZona={z => { void p.social?.ir(z); }} onEditarAparencia={() => setEditandoAparencia(true)} agentes={p.agentes} ocupados={p.ocupados} selecionado={p.selecionado} onEscolher={p.onAgente} animar={prefs.animar && !foco} /></Suspense></div>{decoracao.rascunho && podeDecorar && <EditorAmbiente ambiente={decoracao.rascunho} compacta={compacta} selecionado={movelSelecionado} onSelecionar={setMovelSelecionado} onMudar={decoracao.setRascunho} onCancelar={()=>{decoracao.cancelar();setMovelSelecionado(null);setAvisoDecoracao('');}} onSalvar={()=>void decoracao.salvar().then(ok=>{if(ok){setMovelSelecionado(null);setDecoracaoSalva(true);setAvisoDecoracao('');}})} salvando={decoracao.salvando} disponivel={decoracao.disponivel} conflito={decoracao.conflito} />}</div><div className="legenda-escritorio"><span>Clique no seu personagem para mudar a aparência. Clique em um agente para abrir as tarefas.</span><button className="link" onClick={() => setEditandoAparencia(true)}>Alterar minha aparência</button><button className="link" onClick={() => navegar('agentes')}>Explorar agentes <Icon name="arrow" size={15} /></button></div>{p.agentes.length === 0 && <div className="boas-vindas-vazio"><p>Este escritório está pronto para receber seu primeiro agente.</p>{pode(p.papel, 'editor') && <button className="btn primario" onClick={p.onCriar}>Criar agente</button>}</div>}</> : grade(false)}
        </section>}
        {pagina === 'escritorio' && p.social && <div className="social-area"><div className="pessoas-presentes" aria-label="Pessoas presentes"><strong>{p.social.pessoas.length === 1 ? '1 pessoa na sala' : `${p.social.pessoas.length} pessoas na sala`}</strong>{p.social.pessoas.map(pessoa => pessoa.user_id === p.userId ? <button type="button" className="pessoa-chip" key={pessoa.user_id} onClick={() => setEditandoAparencia(true)} aria-label={`Alterar a aparência de ${pessoa.nome}`}><Robot aparencia={pessoa.aparencia} tamanho={24} />{pessoa.nome} (você)</button> : <span className="pessoa-chip" key={pessoa.user_id}><Robot aparencia={pessoa.aparencia} tamanho={24} />{pessoa.nome}</span>)}</div>{p.social.zona === 'cafe' && <Cafe pessoas={p.social.pessoas} mensagens={p.social.mensagens} userId={p.userId} onEnviar={p.social.falar} />}{p.social.zona === 'reuniao' && <Reunioes escritorioId={p.escritorio.id} userId={p.userId} podeOperar={!!p.papel} podeEditar={false} />}</div>}
        {pagina === 'agentes' && <section className="pagina-workspace"><div className="pagina-titulo"><div><span className="sobretitulo">CADA PERSONAGEM, UMA ESPECIALIDADE</span><h2>Conheça seu time</h2><p className="mudo">Escolha um agente para acompanhar ou enviar uma tarefa.</p></div><span className="total-agentes">{p.agentes.length} agentes</span></div>{grade(true)}</section>}
        {pagina === 'atividade' && <Atividade escritorioId={p.escritorio.id} agentes={p.agentes} onAgente={p.onAgente} />}
        {pagina === 'agendas' && <Agendas escritorioId={p.escritorio.id} agentes={p.agentes} papel={p.papel} />}
        {pagina === 'chat' && <ChatEquipe escritorioId={p.escritorio.id} userId={p.userId} nome={nome} podeOperar={!!p.papel} />}
        {pagina === 'reunioes' && <Reunioes escritorioId={p.escritorio.id} userId={p.userId} podeOperar={pode(p.papel, 'operador')} podeEditar={pode(p.papel, 'editor')} />}
        {pagina === 'preferencias' && <section className="pagina-workspace">{p.acessos}<div className="pagina-titulo"><div><span className="sobretitulo">DO SEU JEITO</span><h2>Um escritório com a sua cara</h2><p className="mudo">Preferências de visualização salvas neste navegador.</p></div><Icon name="settings" size={32} /></div>
          <div className="config-card"><h3>Aparência</h3><p className="mudo">Escolha como você prefere visualizar seu espaço.</p><div className="opcoes-tema" role="group" aria-label="Tema visual">{([{ id: 'sistema', nome: 'Sistema' }, { id: 'claro', nome: 'Claro' }, { id: 'escuro', nome: 'Escuro' }] as const).map(t => <button key={t.id} aria-pressed={prefs.tema === t.id} onClick={() => setPrefs({ ...prefs, tema: t.id })}><span className={'amostra-tema ' + t.id}><i /><i /><i /></span>{t.nome}{prefs.tema === t.id && <Icon name="check" size={16} />}</button>)}</div><label className="switch-linha"><span><strong>Movimento dos personagens</strong><small>Os agentes caminham e celebram as entregas.</small></span><input type="checkbox" checked={prefs.animar} onChange={e => setPrefs({ ...prefs, animar: e.target.checked })} /></label></div>
          {p.perfil && <MeuAvatar perfil={p.perfil} onSalvo={() => { void p.social?.atualizar(); }} />}
          <div className="config-card"><h3>Avatares do escritório</h3><p className="mudo">Dez personagens em pixel art e 60 acessórios para combinar. Os clássicos 3D continuam disponíveis.</p><div className="catalogo-personagens">{PIXEL_PERSONAGENS.map(v => <div key={v.id}><Robot aparencia={{corpo:'monitor',cor:'#ff6175',acessorio:null,estilo:'pixel',avatarPixel:v.id}} tamanho={100}/><strong>{v.nome}</strong></div>)}</div>{pode(p.papel, 'editor') && <><label htmlFor="editar-personagem">Trocar o personagem de um agente</label><select id="editar-personagem" value="" onChange={e => { const a = p.agentes.find(a => a.id === e.target.value); if (a) p.onEditar(a); }}><option value="">Escolha um agente…</option>{p.agentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}</select></>}</div>
          <div className="config-card"><h3>Arquivos do computador</h3><p className="mudo">Conecte uma pasta para os agentes trabalharem com seus arquivos.</p><div className="linha-acoes">{p.ponte}</div></div>
          <div className="config-card"><h3>Sua conta</h3><p className="mudo">{p.email}</p><button className="btn pequeno" onClick={p.onSair}><Icon name="exit" size={16} />Sair da conta</button></div>
        </section>}
      </main>
      <footer className="rodape-workspace"><span><MarcaIcone tamanho={20} />DeskCof · {p.escritorio.nome}</span><button onClick={() => navegar('preferencias')}>Personalizar espaço <Icon name="settings" size={14} /></button></footer>
    </div>
    {p.painel && <div className="painel-workspace">{p.painel}</div>}
    {editandoAparencia && p.perfil && <div className="fundo" role="dialog" aria-modal="true" aria-labelledby="titulo-meu-avatar" onClick={ev => { if (ev.target === ev.currentTarget) setEditandoAparencia(false); }}>
      <div className="editor-aparencia"><MeuAvatar perfil={p.perfil} onSalvo={() => { void p.social?.atualizar(); }} /><button type="button" className="btn" onClick={() => setEditandoAparencia(false)}>Fechar</button></div>
    </div>}
    {p.modal}
  </div>;
}
