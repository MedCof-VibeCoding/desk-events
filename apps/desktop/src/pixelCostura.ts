import type { Aparencia } from './supabase';
import { pixelDe } from './pixelCatalogo';
import { CORES_ROUPA, CORES_CALCA, CORES_CALCADO, roupaDe } from './pixelRoupas';
import type { AtlasPixel } from './pixelRender';

const cache=new WeakMap<HTMLImageElement,Map<string,HTMLCanvasElement>>();
const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const poligono=(ctx:CanvasRenderingContext2D,p:number[][])=>{ctx.beginPath();p.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();};

// Roupa composta uma única vez. A mesma textura veste corpo, braços e pernas animados.
export function baseVestida(atlas:AtlasPixel,indice:number,ap:Aparencia):HTMLCanvasElement {
  const roupa=roupaDe(ap),key=JSON.stringify([pixelDe(ap).id,roupa]);
  let grupo=cache.get(atlas.imagem);if(!grupo){grupo=new Map();cache.set(atlas.imagem,grupo);}
  const pronta=grupo.get(key);if(pronta)return pronta;
  const c=document.createElement('canvas');c.width=256;c.height=384;
  const ctx=c.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas indisponível');
  const r=atlas.recortes[indice],w=300*r.w/r.h;
  ctx.imageSmoothingEnabled=false;ctx.drawImage(atlas.imagem,r.x,r.y,r.w,r.h,128-w/2,40,w,300);
  const superior=CORES_ROUPA.find(x=>x.id===roupa.superior)!.cor;
  const inferior=CORES_CALCA.find(x=>x.id===roupa.inferior)!.cor;
  const calcado=CORES_CALCADO.find(x=>x.id===roupa.calcado)!.cor;
  const paletas={superior:rgb(superior),inferior:rgb(inferior),calcado:rgb(calcado)};
  const im=ctx.getImageData(0,0,256,384),p=im.data;
  for(let y=148;y<341;y++)for(let x=74;x<184;x++){
    const i=(y*256+x)*4;if(p[i+3]<120)continue;
    const lum=(p[i]*.2126+p[i+1]*.7152+p[i+2]*.0722);
    if(lum<23)continue; // Preserva contorno e sombras profundas.
    const camisa=y<233&&((y<184&&x>87&&x<170)||(x>102&&x<155))&&p[i+2]>p[i]*1.1&&p[i+2]>p[i+1]*1.06&&p[i+2]<125;
    const manga=roupa.modelo!=='basica'&&y>184&&y<226&&((x>80&&x<104)||(x>152&&x<178));
    const calca=y>=233&&y<315&&x>96&&x<162;
    const sapato=y>=315;
    const tipo=camisa||manga?'superior':calca?'inferior':sapato?'calcado':null;
    if(!tipo)continue;
    if(roupa.modelo==='basica'&&((tipo==='superior'&&roupa.superior==='marinho')||(tipo==='inferior'&&roupa.inferior==='grafite')||(tipo==='calcado'&&roupa.calcado==='cinza')))continue;
    const tom=paletas[tipo],referencia=manga?125:tipo==='superior'?49:tipo==='inferior'?63:145;
    const brilho=Math.max(.42,Math.min(1.35,lum/referencia));
    for(let k=0;k<3;k++)p[i+k]=Math.min(255,Math.round(tom[k]*brilho));
  }
  ctx.putImageData(im,0,0);
  if(roupa.modelo!=='basica'){
    // A máscara alfa conserva a silhueta do desenho, inclusive no robô.
    ctx.save();ctx.globalCompositeOperation='source-atop';
    ctx.fillStyle='rgba(0,0,0,.20)';ctx.fillRect(105,167,3,62);ctx.fillRect(148,167,3,62);
    if(roupa.modelo==='casual'){
      ctx.fillStyle='#e7e2d7';poligono(ctx,[[120,157],[136,157],[139,230],[117,230]]);
      ctx.fillStyle='rgba(255,255,255,.3)';ctx.fillRect(110,188,8,2);ctx.fillRect(140,188,7,2);
      ctx.fillStyle='#252a3b';ctx.fillRect(105,227,46,4);
    }else if(roupa.modelo==='executiva'){
      ctx.fillStyle='#eee8dc';poligono(ctx,[[117,155],[139,155],[128,195]]);
      ctx.fillStyle='rgba(255,255,255,.27)';
      poligono(ctx,[[115,154],[122,171],[118,183],[128,202],[108,169]]);
      poligono(ctx,[[141,154],[134,171],[138,183],[128,202],[148,169]]);
      ctx.fillStyle='#d7c0a0';ctx.fillRect(128,207,3,3);ctx.fillRect(128,218,3,3);
      ctx.fillStyle='rgba(0,0,0,.4)';ctx.fillRect(110,210,9,2);ctx.fillRect(138,210,9,2);
    }else{
      ctx.fillStyle='#4ee1e5';ctx.fillRect(110,170,2,30);ctx.fillRect(144,170,2,30);
      ctx.fillRect(112,198,9,2);ctx.fillRect(135,198,9,2);ctx.fillRect(126,158,3,28);
      ctx.fillStyle='#252a3b';ctx.fillRect(107,222,42,7);ctx.fillStyle='#4ee1e5';ctx.fillRect(125,223,7,4);
    }
    ctx.restore();
  }
  // Limite de memória durante experimentos com combinações de cores.
  if(grupo.size>=32)grupo.delete(grupo.keys().next().value!);
  grupo.set(key,c);return c;
}
