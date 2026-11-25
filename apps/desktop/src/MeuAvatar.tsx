import { useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Perfil } from './social';
import { AvatarEditor } from './AvatarEditor';
import { normalizarAparencia } from './personagens';
import { AtualizarPerfilContext } from './perfilContext';

export function MeuAvatar({perfil,onSalvo}:{perfil:Perfil;onSalvo?:()=>void}) {
  const atualizarPerfil=useContext(AtualizarPerfilContext);
  const [ap,setAp]=useState(()=>normalizarAparencia(perfil.aparencia??{corpo:'monitor',cor:'#ff6175',acessorio:null,estilo:'pixel'}));
  const [salvando,setSalvando]=useState(false),[erro,setErro]=useState(''),[aviso,setAviso]=useState('');
  useEffect(()=>{if(perfil.aparencia)setAp(normalizarAparencia(perfil.aparencia));},[perfil.aparencia]);
  async function salvar(){
    if(salvando)return;setSalvando(true);setErro('');setAviso('');
    try {
      const {data,error}=await supabase.from('perfis').update({aparencia:normalizarAparencia(ap)}).eq('user_id',perfil.user_id).select('*').single();
      if(error||!data)throw Error('Não foi possível salvar seu avatar. Tente novamente.');
      atualizarPerfil?.(data as Perfil);setAviso('Avatar salvo. Sua aparência foi atualizada nas salas.');onSalvo?.();
    } catch(e){setErro(e instanceof Error?e.message:'Não foi possível salvar seu avatar.');}
    finally{setSalvando(false);}
  }
  return <div className="config-card"><h3 id="titulo-meu-avatar">Meu avatar</h3><p className="mudo">Mude personagem, roupa e acessórios quando quiser. A aparência fica salva na sua conta e aparece nas salas.</p>
    <fieldset disabled={salvando} className="avatar-fieldset"><AvatarEditor value={ap} onChange={a=>{setAp(a);setAviso('');}}/></fieldset>
    {erro&&<p className="erro" role="alert">{erro}</p>}{aviso&&<p role="status">{aviso}</p>}
    <button type="button" className="btn primario" disabled={salvando} onClick={()=>void salvar()}>{salvando?'Salvando…':'Salvar meu avatar'}</button>
  </div>;
}
