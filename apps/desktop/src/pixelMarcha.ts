export type MovimentoMarcha='Idle'|'Walk'|'Type'|'Wave';
export const CICLO_PASSADA=1.1; // Metros por ciclo completo (dois passos).
export const FPS_PIXEL=30;
export const suavizar=(atual:number,alvo:number,dt:number,tau=.1)=>atual+(alvo-atual)*(-Math.expm1(-Math.max(0,dt)/tau));
export function passoPe(fase:number) {
  const t=((fase/(2*Math.PI))%1+1)%1;
  if(t<.6) return {apoio:true,altura:0,avanco:1-2*t/.6};
  const u=(t-.6)/.4,curva=u*u*(3-2*u);
  return {apoio:false,altura:Math.sin(Math.PI*u)**2,avanco:-1+2*curva};
}
export function poseMarcha(tempo:number,fase:number,movimento:MovimentoMarcha,peso=movimento==='Walk'?1:0,parado=false) {
  const forca=parado?0:Math.max(0,Math.min(1,peso));
  const esquerdo=passoPe(fase),direito=passoPe(fase+Math.PI);
  const pe=(p:ReturnType<typeof passoPe>)=>({apoio:p.apoio||forca===0,altura:p.altura*10*forca,avanco:p.avanco*7*forca});
  return {
    esquerdo:pe(esquerdo),direito:pe(direito),
    // Só tronco/quadril sobem; o pé em apoio conserva sua linha de chão.
    troncoY:parado?0:(1-Math.cos(2*fase))*.8*forca+Math.sin(tempo*1.8)*.35*(1-forca),
    troncoX:Math.sin(fase)*1.1*forca,
    braco:parado?0:-Math.sin(fase)*.13*forca+(movimento==='Type'?Math.sin(tempo*9)*.045*(1-forca):0),
    aceno:!parado&&movimento==='Wave'?(-1.9+Math.sin(tempo*6)*.12)*(1-forca):0
  };
}
export type PoseMarcha=ReturnType<typeof poseMarcha>;

// Compartilhado pela prévia e pela sala: mesma cadência e mesma transição.
export class MarchaPixel {
  tempo=0;fase=0;peso=0;
  atualizar(dt:number,movimento:MovimentoMarcha,velocidade:number,parado=false):PoseMarcha {
    dt=Math.min(.1,Math.max(0,dt));
    if(parado){this.peso=0;return poseMarcha(0,0,movimento,0,true);}
    this.tempo+=dt;
    const andando=movimento==='Walk'&&velocidade>0;
    this.peso=suavizar(this.peso,andando?Math.min(1,velocidade/.65):0,dt,andando?.09:.12);
    if(andando)this.fase=(this.fase+dt*velocidade*2*Math.PI/CICLO_PASSADA)%(2*Math.PI);
    if(this.peso<.001)this.peso=0;
    return poseMarcha(this.tempo,this.fase,movimento,this.peso);
  }
}

// Aceleração e frenagem por distância, sem ultrapassar o próximo ponto da rota.
export function avancarPasso(velocidade:number,distancia:number,dt:number,maxima:number,ultimo:boolean) {
  if(dt<=0||distancia<=0)return {velocidade:0,distancia:0};
  const aceleracao=2.4;
  const alvo=ultimo?Math.min(maxima,Math.sqrt(2*aceleracao*distancia)):maxima;
  const v=velocidade+Math.max(-aceleracao*dt,Math.min(aceleracao*dt,alvo-velocidade));
  return {velocidade:v,distancia:Math.min(distancia,(velocidade+v)*.5*dt)};
}
