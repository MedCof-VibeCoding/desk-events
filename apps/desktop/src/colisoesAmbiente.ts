import { TAMANHO_GRANDE, limitesItem, movelDe, type Ambiente, type TamanhoSala } from './ambientes';
export interface Ponto { x:number; z:number }
interface Caixa { minX:number; maxX:number; minZ:number; maxZ:number }
export const RAIO_PERSONAGEM=.28;
const finito=(p:Ponto)=>Number.isFinite(p.x)&&Number.isFinite(p.z);

// Volumes no chão expandidos pelo raio do personagem. A varredura contínua
// impede atravessar objetos finos mesmo quando um quadro demora mais.
export class CaminhosAmbiente {
  private passo=.25;
  private largura:number;
  private altura:number;
  private origemX:number;
  private origemZ:number;
  private sala:Caixa;
  private bloqueados=new Set<number>();
  private caixas:Caixa[]=[];
  constructor(ambiente:Ambiente, tamanho:TamanhoSala=TAMANHO_GRANDE) {
    if(tamanho.id==='grande') {
      this.sala={minX:-10.15,maxX:10.15,minZ:-7.2,maxZ:7.65};
      this.origemX=-10; this.origemZ=-7; this.largura=81; this.altura=59;
    } else {
      this.sala={minX:tamanho.minX+.05,maxX:tamanho.maxX-.05,minZ:tamanho.minZ+.15,maxZ:tamanho.maxZ-.05};
      this.origemX=this.sala.minX; this.origemZ=this.sala.minZ;
      this.largura=Math.max(2,Math.round((this.sala.maxX-this.sala.minX)/this.passo));
      this.altura=Math.max(2,Math.round((this.sala.maxZ-this.sala.minZ)/this.passo));
    }
    const adicionar=(b:Caixa)=>this.caixas.push({minX:b.minX-RAIO_PERSONAGEM,maxX:b.maxX+RAIO_PERSONAGEM,minZ:b.minZ-RAIO_PERSONAGEM,maxZ:b.maxZ+RAIO_PERSONAGEM});
    for(const i of ambiente.itens) {
      const d=movelDe(i.tipo);if(!d||d.tapete||d.superficie)continue;
      if(i.tipo==='posto') {
        const vira=i.giro%2!==0,w=vira?.95:2,prof=vira?2:.95;
        adicionar({minX:i.x-w/2,maxX:i.x+w/2,minZ:i.z-prof/2,maxZ:i.z+prof/2});
        const a=i.giro*Math.PI/2,x=i.x+Math.sin(a)*1.1,z=i.z+Math.cos(a)*1.1;
        adicionar({minX:x-.35,maxX:x+.35,minZ:z-.35,maxZ:z+.35});
      } else adicionar(limitesItem(i));
    }
    for(let id=0;id<this.largura*this.altura;id++)if(this.bloqueado(this.ponto(id)))this.bloqueados.add(id);
  }
  bloqueado(p:Ponto):boolean {
    return !finito(p)||p.x<this.sala.minX||p.x>this.sala.maxX||p.z<this.sala.minZ||p.z>this.sala.maxZ||this.caixas.some(b=>p.x>b.minX&&p.x<b.maxX&&p.z>b.minZ&&p.z<b.maxZ);
  }
  private ponto(id:number):Ponto {return {x:this.origemX+(id%this.largura)*this.passo,z:this.origemZ+Math.floor(id/this.largura)*this.passo};}
  private celula(p:Ponto) {return Math.max(0,Math.min(this.altura-1,Math.round((p.z-this.origemZ)/this.passo)))*this.largura+Math.max(0,Math.min(this.largura-1,Math.round((p.x-this.origemX)/this.passo)));}
  // Usado no nascimento e quando a decoração muda, nunca para avançar um passo.
  livre(p:Ponto):Ponto {
    if(!finito(p))p={x:(this.sala.minX+this.sala.maxX)/2,z:this.sala.maxZ-.4};
    if(!this.bloqueado(p))return {x:p.x,z:p.z};
    let melhor:Ponto={x:(this.sala.minX+this.sala.maxX)/2,z:this.sala.maxZ-.4},distancia=Infinity;
    for(let n=0;n<this.largura*this.altura;n++)if(!this.bloqueados.has(n)){const q=this.ponto(n),d=Math.hypot(q.x-p.x,q.z-p.z);if(d<distancia){melhor=q;distancia=d;}}
    return melhor;
  }
  private fracaoLivre(de:Ponto,para:Ponto):number {
    if(!finito(de)||!finito(para)||this.bloqueado(de))return 0;
    const dx=para.x-de.x,dz=para.z-de.z;let limite=1;
    if(dx>0)limite=Math.min(limite,(this.sala.maxX-de.x)/dx);else if(dx<0)limite=Math.min(limite,(this.sala.minX-de.x)/dx);
    if(dz>0)limite=Math.min(limite,(this.sala.maxZ-de.z)/dz);else if(dz<0)limite=Math.min(limite,(this.sala.minZ-de.z)/dz);
    for(const b of this.caixas) {
      let entrada=-Infinity,saida=Infinity;
      for(const [p,d,min,max] of [[de.x,dx,b.minX,b.maxX],[de.z,dz,b.minZ,b.maxZ]]) {
        if(Math.abs(d)<1e-10){if(p<=min||p>=max){saida=-Infinity;break;}}
        else {const a=(min-p)/d,c=(max-p)/d;entrada=Math.max(entrada,Math.min(a,c));saida=Math.min(saida,Math.max(a,c));}
      }
      if(entrada<saida&&saida>0&&entrada>=0&&entrada<limite)limite=entrada;
    }
    return Math.max(0,Math.min(1,limite));
  }
  segmentoLivre(de:Ponto,para:Ponto):boolean {return !this.bloqueado(para)&&this.fracaoLivre(de,para)>=1;}
  mover(de:Ponto,para:Ponto):Ponto {
    if(!finito(de)||!finito(para))return this.livre(de);
    const t=this.fracaoLivre(de,para),distancia=Math.hypot(para.x-de.x,para.z-de.z);
    const seguro=t<1?Math.max(0,t-.001/Math.max(distancia,.001)):t;
    return {x:de.x+(para.x-de.x)*seguro,z:de.z+(para.z-de.z)*seguro};
  }
  private ancora(p:Ponto):number|null {
    const centro=this.celula(p);let melhor:number|null=null,distancia=Infinity;
    for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++) {
      const x=centro%this.largura+dx,z=Math.floor(centro/this.largura)+dz,id=z*this.largura+x;
      if(x<0||x>=this.largura||z<0||z>=this.altura||this.bloqueados.has(id))continue;
      const q=this.ponto(id),d=Math.hypot(p.x-q.x,p.z-q.z);
      if(d<distancia&&this.segmentoLivre(p,q)){melhor=id;distancia=d;}
    }
    return melhor;
  }
  rota(de:Ponto,para:Ponto):Ponto[] {
    if(this.bloqueado(de)||!finito(para))return [];
    const destino=this.livre(para);
    if(this.segmentoLivre(de,destino))return Math.hypot(de.x-destino.x,de.z-destino.z)>.001?[destino]:[];
    const inicio=this.ancora(de),fim=this.ancora(destino);if(inicio===null||fim===null)return [];
    const fila=[inicio],anteriores=new Map<number,number>([[inicio,-1]]);
    for(let n=0;n<fila.length;n++){
      const id=fila[n];if(id===fim)break;
      for(const vizinho of [id-1,id+1,id-this.largura,id+this.largura]){
        if(vizinho<0||vizinho>=this.largura*this.altura||(Math.abs(vizinho-id)===1&&Math.floor(vizinho/this.largura)!==Math.floor(id/this.largura))||this.bloqueados.has(vizinho)||anteriores.has(vizinho)||!this.segmentoLivre(this.ponto(id),this.ponto(vizinho)))continue;
        anteriores.set(vizinho,id);fila.push(vizinho);
      }
    }
    if(!anteriores.has(fim))return [];
    const caminho:Ponto[]=[];for(let id=fim;id!==-1;id=anteriores.get(id)!)caminho.push(this.ponto(id));caminho.reverse();caminho.push(destino);
    // Curvas suaves somente quando todo o segmento está livre para o corpo.
    const suave:Ponto[]=[];let atual=de,n=0;
    while(n<caminho.length){let proximo=n;for(let k=n+1;k<caminho.length;k++){if(!this.segmentoLivre(atual,caminho[k]))break;proximo=k;}const p=caminho[proximo];if(Math.hypot(p.x-atual.x,p.z-atual.z)>.001)suave.push(p);atual=p;n=proximo+1;}
    return suave;
  }
}
