import { useId, useState } from 'react';
import type { Aparencia } from './supabase';
import { LOOKS, PERSONAGENS, avatarDe, type Personagem } from './personagens';
import { ACESSORIOS_PIXEL, PIXEL_PERSONAGENS, SLOTS_PIXEL, equipamentosDe, equiparPixel, pixelDe, type MovimentoPixel, type SlotPixel } from './pixelCatalogo';
import { PixelAvatar, IconeAcessorio } from './PixelAvatar';
import { Robot } from './Robot';
import { AvatarPreview3D } from './AvatarPreview3D';
import { ROUPAS_PIXEL, CORES_ROUPA, CORES_CALCA, CORES_CALCADO, roupaDe, mudarRoupa, type RoupaPixel } from './pixelRoupas';

export function AvatarEditor({value,onChange}:{value:Aparencia;onChange:(ap:Aparencia)=>void}) {
  const id=useId();const [slot,setSlot]=useState<SlotPixel>('cabeca');
  const [movimento,setMovimento]=useState<MovimentoPixel>('Idle');
  const [busca,setBusca]=useState('');
  const pixel=value.estilo==='pixel',equipados=equipamentosDe(value);
  const roupa=roupaDe(value);
  const itens=ACESSORIOS_PIXEL.filter(a=>a.slot===slot&&a.nome.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR')));
  return <section className="avatar-editor" aria-label="Personalização do avatar">
    <label htmlFor={`${id}-estilo`}>Coleção de personagens</label>
    <select id={`${id}-estilo`} value={pixel?'pixel':'3d'} onChange={e=>onChange({...value,estilo:e.target.value as 'pixel'|'3d',avatarPixel:pixelDe(value).id})}>
      <option value="pixel">Novos personagens 3D · 10 personagens</option><option value="3d">Clássicos 3D · 36 combinações</option>
    </select>
    <div className="avatar-editor-previa">
      {pixel?<AvatarPreview3D aparencia={value} movimento={movimento}/>:<Robot aparencia={value} tamanho={180}/>}
      <strong>{pixel?pixelDe(value).nome:avatarDe(value).nome}</strong>
    </div>
    {pixel?<>
      <div className="avatar-movimentos" role="group" aria-label="Testar movimento">
        {([{id:'Idle',nome:'Parado'},{id:'Walk',nome:'Caminhar'},{id:'Type',nome:'Trabalhar'},{id:'Wave',nome:'Acenar'}] as const).map(m=><button type="button" key={m.id} aria-pressed={movimento===m.id} onClick={()=>setMovimento(m.id)}>{m.nome}</button>)}
      </div>
      <div className="pixel-personagens" role="group" aria-label="Escolher personagem">
        {PIXEL_PERSONAGENS.map(p=><button type="button" key={p.id} aria-pressed={pixelDe(value).id===p.id} onClick={()=>onChange({...value,avatarPixel:p.id})}>
          <PixelAvatar aparencia={{...value,avatarPixel:p.id,acessorios:{}}} tamanho={72}/><span>{p.nome}</span>
        </button>)}
      </div>
      <fieldset className="avatar-roupas">
        <legend>Roupas</legend>
        <div className="avatar-looks" role="group" aria-label="Modelo da roupa">
          {ROUPAS_PIXEL.map(r=><button type="button" key={r.id} aria-pressed={roupa.modelo===r.id} onClick={()=>onChange(mudarRoupa(value,{modelo:r.id}))}>
            <PixelAvatar aparencia={mudarRoupa({...value,acessorios:{}},{modelo:r.id})} tamanho={82}/><span>{r.nome}</span>
          </button>)}
        </div>
        <div className="avatar-cores-roupa">
          <label htmlFor={`${id}-superior`}>Parte de cima<select id={`${id}-superior`} value={roupa.superior} onChange={e=>onChange(mudarRoupa(value,{superior:e.target.value as RoupaPixel['superior']}))}>{CORES_ROUPA.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
          <label htmlFor={`${id}-inferior`}>Calça<select id={`${id}-inferior`} value={roupa.inferior} onChange={e=>onChange(mudarRoupa(value,{inferior:e.target.value as RoupaPixel['inferior']}))}>{CORES_CALCA.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
          <label htmlFor={`${id}-calcado`}>Calçado<select id={`${id}-calcado`} value={roupa.calcado} onChange={e=>onChange(mudarRoupa(value,{calcado:e.target.value as RoupaPixel['calcado']}))}>{CORES_CALCADO.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
        </div>
      </fieldset>
      <div className="avatar-equipados"><strong>Acessórios</strong><button type="button" className="link" disabled={!Object.keys(equipados).length} onClick={()=>onChange({...value,acessorios:{}})}>Remover todos</button></div>
      <div className="avatar-slots" role="group" aria-label="Categoria de acessórios">
        {SLOTS_PIXEL.map(s=><button type="button" key={s.id} aria-pressed={slot===s.id} onClick={()=>setSlot(s.id)}>{s.nome}{equipados[s.id]&&<span aria-label="equipado"> ●</span>}</button>)}
      </div>
      <label htmlFor={`${id}-busca`}>Buscar acessório</label><input id={`${id}-busca`} type="search" value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Nome do acessório"/>
      <div className="pixel-acessorios" role="group" aria-label={`Acessórios: ${SLOTS_PIXEL.find(s=>s.id===slot)?.nome}`}>
        <button type="button" aria-pressed={!equipados[slot]} onClick={()=>onChange(equiparPixel(value,slot))}><span className="sem-acessorio" aria-hidden="true">∅</span><span>Sem acessório</span></button>
        {itens.map(a=><button type="button" key={a.id} aria-pressed={equipados[slot]===a.id} onClick={()=>onChange(equiparPixel(value,slot,a.id))}><IconeAcessorio item={a}/><span>{a.nome}</span></button>)}
      </div>
      {!itens.length&&<p role="status">Nenhum acessório encontrado nesta categoria.</p>}
      <p className="mudo">Uma opção por categoria. Viseiras e capuz substituem os óculos.</p>
    </>:<>
      <div className="personagens" role="group" aria-label="Personagens clássicos">{PERSONAGENS.map(p=><button type="button" className="personagem-opcao" key={p.id} aria-pressed={avatarDe(value).personagem===p.id} onClick={()=>onChange({...value,personagem:p.id as Personagem})}><img src={avatarDe({...value,personagem:p.id as Personagem}).imagem} width={56} height={64} alt=""/><span>{p.nome}</span></button>)}</div>
      <div className="variacoes-avatar" role="group" aria-label="Versão">{([{id:'m',nome:'Masculino'},{id:'f',nome:'Feminina'}] as const).map(v=><button type="button" className="btn" key={v.id} aria-pressed={value.versao===v.id} onClick={()=>onChange({...value,versao:v.id})}>{v.nome}</button>)}</div>
      <div className="variacoes-avatar" role="group" aria-label="Look">{LOOKS.map(l=><button type="button" className="btn" key={l.id} aria-pressed={value.look===l.id} onClick={()=>onChange({...value,look:l.id})}>{l.nome}</button>)}</div>
    </>}
  </section>;
}
