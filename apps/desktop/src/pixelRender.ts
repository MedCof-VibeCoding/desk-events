import { ACESSORIOS_PIXEL, ATLAS_PIXEL, PIXEL_PERSONAGENS, equipamentosDe, pixelDe, type MovimentoPixel } from './pixelCatalogo';
import type { Aparencia } from './supabase';
import { PIXEL_ATLAS } from './pixelAtlas';
import { baseVestida } from './pixelCostura';
import { poseMarcha, type PoseMarcha } from './pixelMarcha';

export type Recorte = { x:number; y:number; w:number; h:number };
export type AtlasPixel = { imagem: HTMLImageElement; recortes: Recorte[] };
export type RecursosPixel = { bases:AtlasPixel; original:AtlasPixel; extra:AtlasPixel };
const cache = new Map<string, Promise<AtlasPixel>>();

// Os PNGs originais são preservados. Os recortes são calculados uma vez no carregamento.
export function carregarAtlas(url:string, colunas:number, linhas:number): Promise<AtlasPixel> {
  let promessa = cache.get(url);
  if (!promessa) {
    promessa = new Promise<AtlasPixel>((resolve, reject) => {
      const imagem = new Image();
      imagem.onload = () => {
        try {
          const key = (Object.keys(ATLAS_PIXEL) as (keyof typeof ATLAS_PIXEL)[]).find(k=>ATLAS_PIXEL[k]===url);
          if (key) {
            const dados=PIXEL_ATLAS[key];
            if (imagem.width!==dados.width||imagem.height!==dados.height) throw Error('A imagem do catálogo está em um tamanho diferente do original.');
            resolve({imagem,recortes:dados.recortes.map(r=>({...r}))}); return;
          }
          const c = document.createElement('canvas'); c.width=imagem.width; c.height=imagem.height;
          const ctx = c.getContext('2d', { willReadFrequently:true });
          if (!ctx) throw Error('Seu navegador não disponibilizou a prévia do avatar.');
          ctx.drawImage(imagem,0,0);
          const pixels=ctx.getImageData(0,0,c.width,c.height).data;
          const recortes:Recorte[]=[];
          for (let linha=0;linha<linhas;linha++) for(let coluna=0;coluna<colunas;coluna++) {
            const x0=Math.round(coluna*c.width/colunas), x1=Math.round((coluna+1)*c.width/colunas);
            const y0=Math.round(linha*c.height/linhas), y1=Math.round((linha+1)*c.height/linhas);
            let minX=x1,minY=y1,maxX=x0,maxY=y0;
            for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) {
              if(pixels[(y*c.width+x)*4+3] < 100) continue;
              minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y);
            }
            if(maxX<=minX || maxY<=minY) throw Error('Uma peça do catálogo está vazia.');
            recortes.push({x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1});
          }
          resolve({imagem,recortes});
        } catch(e) { reject(e); }
      };
      imagem.onerror=()=>reject(Error('Não foi possível carregar as imagens dos avatares. Tente novamente.'));
      imagem.src=url;
    }).catch(e=>{cache.delete(url);throw e;});
    cache.set(url,promessa);
  }
  return promessa;
}
export async function carregarRecursosPixel():Promise<RecursosPixel> {
  const [bases,original,extra]=await Promise.all([
    carregarAtlas(ATLAS_PIXEL.bases,5,2),carregarAtlas(ATLAS_PIXEL.original,6,5),carregarAtlas(ATLAS_PIXEL.extra,6,5)
  ]);
  return {bases,original,extra};
}
export function desenharRecorte(ctx:CanvasRenderingContext2D, atlas:AtlasPixel, indice:number, x:number,y:number,w:number,h?:number) {
  const r=atlas.recortes[indice]; if(!r)return;
  ctx.drawImage(atlas.imagem,r.x,r.y,r.w,r.h,x,y,w,h??w*r.h/r.w);
}

export function desenharPixel(ctx:CanvasRenderingContext2D, recursos:RecursosPixel, ap:Aparencia,
  tempo=0, fase=0, movimento:MovimentoPixel='Idle', parado=true, espelhar=false, marcha?:PoseMarcha) {
  ctx.clearRect(0,0,256,384);ctx.save();ctx.imageSmoothingEnabled=false;
  if(espelhar){ctx.translate(256,0);ctx.scale(-1,1);}
  const indice=PIXEL_PERSONAGENS.findIndex(p=>p.id===pixelDe(ap).id);
  const base=baseVestida(recursos.bases,indice,ap);
  const pose=marcha??poseMarcha(tempo,fase,movimento,movimento==='Walk'?1:0,parado);
  const equipamentos=Object.values(equipamentosDe(ap));
  const itens=ACESSORIOS_PIXEL.filter(a=>equipamentos.includes(a.id));
  const acessorio=(a:typeof itens[number])=>{
    const [cx,topo,w]=a.encaixe;
    ctx.save();
    if(a.slot==='mao'||a.slot==='pulso'){ctx.translate(153,184);ctx.rotate(pose.braco+pose.aceno);ctx.translate(-153,-184);}
    desenharRecorte(ctx,recursos[a.atlas],a.indice,cx-w/2,topo,w);
    ctx.restore();
  };
  ctx.save();ctx.translate(pose.troncoX,pose.troncoY);
  itens.filter(a=>a.atras).forEach(acessorio);
  ctx.restore();
  // Coxa e canela se deformam em segmentos unidos; os sapatos ficam horizontais.
  // Não há rotação lateral da perna inteira nem translação global que erga o pé de apoio.
  const faixa=(sx:number,sy:number,w:number,h:number,dx0:number,dy0:number,dx1:number,dy1:number)=>{
    ctx.save();ctx.transform(1,0,(dx1-dx0)/h,(h+dy1-dy0)/h,sx+dx0,sy+dy0);
    ctx.drawImage(base,sx,sy,w,h,0,0,w,h);ctx.restore();
  };
  const perna=(sx:number,pe:PoseMarcha['esquerdo'],lado:number)=>{
    const deslocamento=pe.avanco*.4,joelho=deslocamento*.45+lado*pe.altura*.12;
    faixa(sx,246,128,39,pose.troncoX,pose.troncoY,joelho,-pe.altura*.35);
    faixa(sx,285,128,38,joelho,-pe.altura*.35,deslocamento,-pe.altura);
    ctx.drawImage(base,sx,323,128,25,sx+deslocamento,323-pe.altura,128,25);
  };
  perna(0,pose.esquerdo,-1);perna(128,pose.direito,1);
  ctx.save();ctx.translate(pose.troncoX,pose.troncoY);
  ctx.save();ctx.beginPath();ctx.rect(0,0,256,246);
  ctx.rect(80,184,24,62);ctx.rect(152,184,26,62);ctx.clip('evenodd');
  ctx.drawImage(base,0,0);ctx.restore();
  const braco=(x:number,w:number,angulo:number,pivoX:number)=>{
    const py=184;
    // Dois pixels de sobreposição fecham a articulação ao flexionar o antebraço.
    ctx.save();ctx.translate(pivoX,py);ctx.rotate(angulo);ctx.translate(-pivoX,-py);
    ctx.drawImage(base,x,py,w,62,x,py,w,62);ctx.restore();
  };
  braco(80,24,-pose.braco,104);braco(152,26,pose.braco+pose.aceno,153);
  itens.filter(a=>!a.atras).forEach(acessorio);
  ctx.restore();ctx.restore();
}
