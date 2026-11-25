import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Aparencia } from './supabase';
import { ModelosAvatar, type AvatarMovel, type MovimentoAvatar } from './avatar3d';
import { chavePixel } from './pixelCatalogo';

export function AvatarPreview3D({aparencia,movimento}:{aparencia:Aparencia;movimento:MovimentoAvatar}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const escolha=useRef(aparencia),acao=useRef(movimento);
  const carregar=useRef<(()=>void)|null>(null),giro=useRef(0);
  const [estado,setEstado]=useState<'carregando'|'pronto'|'erro'>('carregando');
  escolha.current=aparencia;acao.current=movimento;
  const chave=chavePixel(aparencia);
  useEffect(()=>{
    if(!canvas.current) return;
    let renderer:THREE.WebGLRenderer;
    try {renderer=new THREE.WebGLRenderer({canvas:canvas.current,alpha:true,antialias:true});}
    catch {setEstado('erro');return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    renderer.setSize(220,264,false);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    const scene=new THREE.Scene();
    const camera=new THREE.OrthographicCamera(-1.05,1.05,1.26,-1.26,.1,30);
    camera.position.set(0,1.35,4);camera.lookAt(0,1,0);
    scene.add(new THREE.HemisphereLight('#fff5e8','#64778a',2));
    const luz=new THREE.DirectionalLight('#ffffff',2.2);luz.position.set(-3,5,4);scene.add(luz);
    const sombra=new THREE.Mesh(new THREE.CircleGeometry(.35,32),new THREE.MeshBasicMaterial({color:'#101820',transparent:true,opacity:.15}));
    sombra.rotation.x=-Math.PI/2;sombra.scale.y=.75;sombra.position.y=.002;scene.add(sombra);
    const modelos=new ModelosAvatar();let avatar:AvatarMovel|null=null,encerrado=false,versao=0,frame=0,ultimo=0;
    const reduzido=window.matchMedia('(prefers-reduced-motion: reduce)');
    carregar.current=()=>{
      const pedido=++versao;setEstado('carregando');
      void modelos.criarAparencia(escolha.current).then(novo=>{
        if(encerrado||pedido!==versao) {novo?.destruir();return;}
        if(!novo) {setEstado('erro');return;}
        if(avatar) {scene.remove(avatar.root);avatar.destruir();}
        avatar=novo;scene.add(novo.root);setEstado('pronto');
      }).catch(()=>{if(!encerrado&&pedido===versao)setEstado('erro');});
    };
    const render=(tempo:number)=>{
      if(encerrado)return;
      const dt=ultimo?Math.min((tempo-ultimo)/1000,.05):0;ultimo=tempo;
      if(avatar) {avatar.root.rotation.y=giro.current;avatar.passo(dt,acao.current,reduzido.matches);}
      renderer.render(scene,camera);frame=requestAnimationFrame(render);
    };
    frame=requestAnimationFrame(render);
    return ()=>{encerrado=true;versao++;carregar.current=null;cancelAnimationFrame(frame);avatar?.destruir();modelos.destruir();sombra.geometry.dispose();sombra.material.dispose();renderer.dispose();};
  },[]);
  useEffect(()=>{carregar.current?.();},[chave]);
  return <div className="avatar-previa-3d">
    <canvas ref={canvas} width={220} height={264} style={{width:220,height:264,display:'block'}} role="img" aria-label="Personagem 3D com roupa e acessórios selecionados"/>
    {estado==='carregando'&&<span role="status">Carregando personagem…</span>}
    {estado==='erro'&&<span role="status">Não foi possível abrir a prévia 3D. <button type="button" onClick={()=>carregar.current?.()}>Tentar novamente</button></span>}
    <label style={{display:'flex',gap:8,alignItems:'center',fontSize:12}}>Girar personagem<input aria-label="Girar personagem" type="range" min={-180} max={180} defaultValue={0} onChange={e=>{giro.current=Number(e.target.value)*Math.PI/180;}}/></label>
  </div>;
}
