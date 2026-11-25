import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { criarAmbiente, validarAmbiente, type Ambiente } from './ambientes';

export function useAmbiente(escritorioId: string) {
  const [salvo,setSalvo]=useState<Ambiente>(()=>criarAmbiente());
  const [rascunho,setRascunho]=useState<Ambiente|null>(null);
  const [carregando,setCarregando]=useState(true),[salvando,setSalvando]=useState(false),[erro,setErro]=useState('');
  const [disponivel,setDisponivel]=useState(false),[conflito,setConflito]=useState(false);
  const revisao=useRef(0), base=useRef(0), editando=useRef(false), ativo=useRef(true), gravando=useRef(false);
  const carregar=useCallback(async()=>{
    try {
      const {data,error}=await supabase.from('ambientes_escritorio').select('layout,revisao').eq('escritorio_id',escritorioId).maybeSingle();
      if(!ativo.current) return;
      if(error) { setDisponivel(false); setErro('Não foi possível carregar a decoração compartilhada. Verifique a conexão e a atualização do banco.'); return; }
      if(data && !validarAmbiente(data.layout)) { setDisponivel(false); setErro('A decoração salva é incompatível. Não foi substituída.'); return; }
      if((data?.revisao ?? 0)<revisao.current)return;
      setDisponivel(true); if(!editando.current)setErro(''); revisao.current=data?.revisao ?? 0;
      if(editando.current && base.current!==revisao.current && !gravando.current) setConflito(true);
      setSalvo(data?.layout ?? criarAmbiente());
    } catch { if(ativo.current) {setDisponivel(false);setErro('Não foi possível conectar para carregar o ambiente.');} }
    finally {if(ativo.current)setCarregando(false);}
  },[escritorioId]);
  useEffect(()=>{
    ativo.current=true; void carregar();
    const canal=supabase.channel(`ambiente-${escritorioId}`).on('postgres_changes',{event:'*',schema:'public',table:'ambientes_escritorio',filter:`escritorio_id=eq.${escritorioId}`},()=>void carregar()).subscribe();
    return ()=>{ativo.current=false;void supabase.removeChannel(canal);};
  },[carregar,escritorioId]);
  function editar() { base.current=revisao.current; editando.current=true; setRascunho(structuredClone(salvo)); setConflito(false); }
  function cancelar() { if(gravando.current)return;editando.current=false;setRascunho(null);setConflito(false);if(disponivel)setErro(''); }
  async function salvar() {
    if(!rascunho || gravando.current || !disponivel || conflito)return false;
    if(!validarAmbiente(rascunho)){setErro('Revise a posição dos móveis antes de salvar.');return false;}
    gravando.current=true;setSalvando(true);setErro('');
    try {
      const {data,error}=await supabase.rpc('salvar_ambiente',{sala:escritorioId,conteudo:rascunho,revisao_esperada:base.current});
      if(error) {if(ativo.current){setErro(error.code==='40001'?'Outra pessoa alterou a sala. Cancele a prévia e abra novamente para carregar a versão atual.':'Não foi possível salvar a decoração. Suas alterações continuam na prévia.');if(error.code==='40001')setConflito(true);}return false;}
      if(ativo.current){revisao.current=Number(data);setSalvo(rascunho);setRascunho(null);editando.current=false;setConflito(false);}
      return true;
    } catch {if(ativo.current)setErro('Falha de conexão ao salvar. Suas alterações continuam na prévia.');return false;}
    finally {gravando.current=false;if(ativo.current)setSalvando(false);}
  }
  return {ambiente:rascunho??salvo,rascunho,setRascunho,carregando,salvando,erro,disponivel,conflito,editar,cancelar,salvar,recarregar:carregar};
}
