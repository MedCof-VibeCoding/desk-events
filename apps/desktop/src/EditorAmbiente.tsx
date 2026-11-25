import { useEffect, useState } from 'react';
import { ESTILOS, MOVEIS, criarAmbiente, moverItem, removerItem, lugarLivre, movelDe, MAX_ITENS, type Ambiente, type ItemAmbiente } from './ambientes';
import './ambientes.css';
interface Props { ambiente:Ambiente; selecionado:string|null; onSelecionar:(id:string|null)=>void; onMudar:(a:Ambiente)=>void; onCancelar:()=>void; onSalvar:()=>void; salvando:boolean; disponivel:boolean; conflito:boolean }
export function EditorAmbiente(p:Props) {
  const [aba,setAba]=useState<'estilos'|'moveis'|'itens'>('estilos'),[busca,setBusca]=useState(''),[categoria,setCategoria]=useState('Todos'),[aviso,setAviso]=useState('');
  const [historico,setHistorico]=useState<Ambiente[]>([]);
  const [miniaturas,setMiniaturas]=useState<Record<string,string>>({});
  useEffect(()=>{if(aba!=='moveis')return;let ativo=true;void import('./miniaturasMoveis').then(m=>m.miniaturasMoveis(p.ambiente.estilo)).then(v=>{if(ativo)setMiniaturas(v);}).catch(()=>{});return()=>{ativo=false;};},[aba,p.ambiente.estilo]);
  const selecionado=p.ambiente.itens.find(i=>i.id===p.selecionado);
  function alterar(a:Ambiente) {setHistorico(h=>[...h.slice(-19),p.ambiente]);p.onMudar(a);setAviso('');}
  function adicionar(tipo:string) {const item=lugarLivre(tipo,p.ambiente.itens);if(!item){setAviso(p.ambiente.itens.length>=MAX_ITENS?'Limite de 100 itens atingido.':'Não há espaço livre para este móvel. Acessórios de mesa precisam de uma mesa livre.');return;}alterar({...p.ambiente,itens:[...p.ambiente.itens,item]});p.onSelecionar(item.id);}
  function mudar(item:ItemAmbiente) {const resultado=moverItem(p.ambiente,item);if(resultado.erro){setAviso(resultado.erro);return;}alterar(resultado.ambiente!);}
  function girar(item:ItemAmbiente) {mudar({...item,giro:(item.giro+1)%4});}
  function excluir(id:string) {const proximo=removerItem(p.ambiente,id);alterar(proximo);if(p.selecionado && !proximo.itens.some(i=>i.id===p.selecionado))p.onSelecionar(null);}
  function adicionarEstacao() {
    const usados=new Set(p.ambiente.itens.filter(i=>i.tipo==='posto').map(i=>i.slot));
    const slot=Array.from({length:12},(_,n)=>n).find(s=>!usados.has(s));
    if(slot===undefined)return;
    const item=lugarLivre('posto',p.ambiente.itens);
    if(!item){setAviso(p.ambiente.itens.length>=MAX_ITENS?'Limite de 100 itens atingido.':'Não há espaço livre para a estação.');return;}
    const estacao={...item,slot};alterar({...p.ambiente,itens:[...p.ambiente.itens,estacao]});p.onSelecionar(estacao.id);
  }
  const faltamEstacoes=p.ambiente.itens.filter(i=>i.tipo==='posto').length<12;
  const encontrados=MOVEIS.filter(m=>(categoria==='Todos'||m.categoria===categoria)&&m.nome.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR')));
  return <aside className="editor-ambiente" aria-label="Editor do escritório">
    <div className="editor-titulo"><div><span className="sobretitulo">SEU ESPAÇO</span><h2>Decorar escritório</h2></div><span>{p.ambiente.itens.length}/{MAX_ITENS}</span></div>
    <p className="editor-ajuda">Arraste um móvel na cena ou selecione-o para ajustar. A prévia só aparece para você até salvar.</p>
    <fieldset disabled={p.salvando} className="editor-conteudo">
    <div className="editor-abas" role="group" aria-label="Catálogo">{(['estilos','moveis','itens'] as const).map(a=><button key={a} aria-pressed={aba===a} onClick={()=>setAba(a)}>{a==='estilos'?'10 estilos':a==='moveis'?'48 móveis':'Na sala'}</button>)}</div>
    {aba==='estilos' && <><p className="editor-ajuda">Trocar as cores preserva seus móveis. Aplicar a disposição substitui a prévia atual.</p><div className="grade-estilos">{ESTILOS.map(e=><button key={e.id} aria-pressed={p.ambiente.estilo===e.id} onClick={()=>alterar({...p.ambiente,estilo:e.id})}><span className="amostra-ambiente" style={{background:e.parede}}><i style={{background:e.piso}}/><b style={{background:e.madeira}}/><em style={{background:e.destaque}}/></span><strong>{e.nome}</strong><small>{e.descricao}</small></button>)}</div><button className="btn" onClick={()=>{alterar(criarAmbiente(p.ambiente.estilo));p.onSelecionar(null);}}>Aplicar disposição deste estilo</button></>}
    {aba==='moveis' && <><label htmlFor="busca-moveis">Buscar móvel</label><input id="busca-moveis" value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Mesa, planta, sofá…"/><label htmlFor="categoria-moveis">Categoria</label><select id="categoria-moveis" value={categoria} onChange={e=>setCategoria(e.target.value)}>{['Todos',...new Set(MOVEIS.map(m=>m.categoria))].map(c=><option key={c}>{c}</option>)}</select><div className="catalogo-moveis">{encontrados.map(m=><button key={m.id} onClick={()=>adicionar(m.id)} title={`Adicionar ${m.nome}`}>{miniaturas[m.id] ? <img className="miniatura-movel" src={miniaturas[m.id]} alt="" width={72} height={58}/> : <span className="icone-movel" aria-hidden="true">{({Mesas:'▰',Assentos:'▣',Armários:'▤',Utilidades:'◫',Decoração:'❋',Equipamentos:'▱'})[m.categoria]}</span>}<strong>{m.nome}</strong><small>{m.superficie?'Sobre uma mesa':m.categoria}</small><span aria-hidden="true">+</span></button>)}</div>{!encontrados.length&&<p>Nenhum móvel encontrado.</p>}</>}
    {aba==='itens' && <><div className="lista-moveis">{p.ambiente.itens.map(i=>{const nome=`${movelDe(i.tipo)?.nome??'Móvel'}${i.slot!==undefined?` ${i.slot+1}`:''}`;return <div key={i.id} className="item-sala"><button aria-pressed={i.id===p.selecionado} onClick={()=>p.onSelecionar(i.id)}>{nome}<small>{i.x.toFixed(2)} / {i.z.toFixed(2)}</small></button><button aria-label={`Girar ${nome}`} onClick={()=>girar(i)}>Girar</button><button aria-label={`Excluir ${nome}`} title="Remove também os acessórios apoiados neste móvel" onClick={()=>excluir(i.id)}>Excluir</button></div>;})}</div>{faltamEstacoes && <button className="btn" onClick={adicionarEstacao}>Recolocar estação</button>}</>}
    {selecionado && <div className="ajuste-movel"><h3>{movelDe(selecionado.tipo)?.nome}{selecionado.slot!==undefined?` ${selecionado.slot+1}`:''}</h3><p className="editor-ajuda">Passos de 0,25 m. Use os botões ou arraste na cena. Orientação {selecionado.giro*90}°.</p><div className="mover-movel">{[{label:'Mover para norte',x:0,z:-.25,t:'↑'},{label:'Mover para oeste',x:-.25,z:0,t:'←'},{label:'Mover para sul',x:0,z:.25,t:'↓'},{label:'Mover para leste',x:.25,z:0,t:'→'}].map(d=><button key={d.label} aria-label={d.label} onClick={()=>mudar({...selecionado,x:selecionado.x+d.x,z:selecionado.z+d.z})}>{d.t}</button>)}<button onClick={()=>girar(selecionado)}>Girar 90°</button></div><div className="linha-acoes">{selecionado.tipo!=='posto' && <button onClick={()=>adicionar(selecionado.tipo)}>Duplicar</button>}<button onClick={()=>excluir(selecionado.id)} title="Remove também os acessórios apoiados neste móvel">Excluir</button></div></div>}
    {historico.length>0&&<button className="link" onClick={()=>{p.onMudar(historico[historico.length-1]);setHistorico(h=>h.slice(0,-1));setAviso('');}}>Desfazer última ação do painel</button>}
    </fieldset>
    <p role="status" className="editor-aviso">{aviso || (p.conflito?'A sala foi alterada por outra pessoa. Cancele e reabra para carregar a versão atual.':'')}</p>
    <div className="editor-rodape"><button className="btn" disabled={p.salvando} onClick={p.onCancelar}>Cancelar</button><button className="btn primario" disabled={p.salvando||!p.disponivel||p.conflito} onClick={p.onSalvar}>{p.salvando?'Salvando…':'Salvar sala'}</button></div>
  </aside>;
}
