import { useEffect, useRef, useState } from 'react';
import type { Aparencia } from './supabase';
import { ATLAS_PIXEL, chavePixel, pixelDe, type AcessorioPixel, type MovimentoPixel } from './pixelCatalogo';
import { carregarAtlas, carregarRecursosPixel, desenharPixel, desenharRecorte } from './pixelRender';
import './pixelAvatar.css';
import { MarchaPixel, FPS_PIXEL } from './pixelMarcha';

export function PixelAvatar({aparencia,tamanho=96,movimento='Idle',animar=false,ativo=true,permitirRetentar=false}: {
  aparencia:Aparencia; tamanho?:number; movimento?:MovimentoPixel; animar?:boolean; ativo?:boolean; permitirRetentar?:boolean
}) {
  const canvas=useRef<HTMLCanvasElement>(null),[erro,setErro]=useState(false),[tentativa,setTentativa]=useState(0);
  const chave=chavePixel(aparencia);
  const marcha=useRef(new MarchaPixel());
  useEffect(()=>{
    let cancelado=false,quadro=0;setErro(false);
    void carregarRecursosPixel().then(recursos=>{
      if(cancelado||!canvas.current)return;
      const ctx=canvas.current.getContext('2d');if(!ctx)return;
      const reduzir=window.matchMedia?.('(prefers-reduced-motion: reduce)');
      let inicio=performance.now(),ultimo=-Infinity,anterior=inicio;
      const desenhar=(agora:number)=>{
        if(cancelado)return;
        const parado=!animar||!ativo||!!reduzir?.matches;
        const pose=marcha.current.atualizar((agora-anterior)/1000,movimento,movimento==='Walk'?.8:0,parado);anterior=agora;
        if(agora-ultimo>=1000/FPS_PIXEL){
          ultimo=Number.isFinite(ultimo)?agora-(agora-ultimo)%(1000/FPS_PIXEL):agora;
          desenharPixel(ctx,recursos,aparencia,marcha.current.tempo,marcha.current.fase,movimento,parado,false,pose);
        }
        if(animar&&ativo)quadro=requestAnimationFrame(desenhar);
      };desenhar(inicio);
    }).catch(()=>{if(!cancelado)setErro(true);});
    return()=>{cancelado=true;cancelAnimationFrame(quadro);};
  },[chave,tentativa,movimento,animar,ativo]);
  return <span className="pixel-avatar" style={{width:tamanho,height:tamanho,opacity:ativo?1:.45}}>
    <canvas ref={canvas} width={256} height={384} role="img" aria-label={`Personagem ${pixelDe(aparencia).nome}`} />
    {erro&&<span className="pixel-erro" role="status">Imagem indisponível{permitirRetentar&&<button type="button" onClick={()=>setTentativa(t=>t+1)}>Tentar novamente</button>}</span>}
  </span>;
}
export function IconeAcessorio({item}:{item:AcessorioPixel}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    let cancelado=false;
    void carregarAtlas(ATLAS_PIXEL[item.atlas],6,5).then(atlas=>{
      if(cancelado)return;const ctx=canvas.current?.getContext('2d');if(!ctx)return;
      ctx.clearRect(0,0,80,80);ctx.imageSmoothingEnabled=false;
      const r=atlas.recortes[item.indice],escala=68/Math.max(r.w,r.h),w=r.w*escala,h=r.h*escala;
      desenharRecorte(ctx,atlas,item.indice,(80-w)/2,(80-h)/2,w,h);
    }).catch(()=>{});
    return()=>{cancelado=true;};
  },[item.id]);
  return <canvas ref={canvas} width={80} height={80} aria-hidden="true" />;
}
