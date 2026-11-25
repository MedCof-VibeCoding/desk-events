import * as THREE from 'three';
import type { Aparencia } from './supabase';
import type { MovimentoAvatar } from './avatar3d';
import { desenharPixel, type RecursosPixel } from './pixelRender';
import { MarchaPixel, FPS_PIXEL } from './pixelMarcha';

// Billboard articulado: conserva o desenho em pixel art dentro da sala 3D.
export class PixelAvatarAnimado {
  root=new THREE.Group();
  private canvas=document.createElement('canvas');
  private ctx:CanvasRenderingContext2D;
  private textura:THREE.CanvasTexture;
  private material:THREE.SpriteMaterial;
  private marcha=new MarchaPixel();private acumulado=Infinity;private espelhar=false;
  private anterior='';private encerrado=false;
  private direcao=new THREE.Vector3();private quaternion=new THREE.Quaternion();
  constructor(private recursos:RecursosPixel,private ap:Aparencia) {
    this.canvas.width=256;this.canvas.height=384;
    const ctx=this.canvas.getContext('2d');if(!ctx)throw Error('Canvas indisponível');this.ctx=ctx;
    this.textura=new THREE.CanvasTexture(this.canvas);this.textura.colorSpace=THREE.SRGBColorSpace;
    this.textura.magFilter=THREE.NearestFilter;this.textura.minFilter=THREE.LinearFilter;this.textura.generateMipmaps=false;
    this.material=new THREE.SpriteMaterial({map:this.textura,transparent:true,alphaTest:.1,depthWrite:false});
    const sprite=new THREE.Sprite(this.material);sprite.scale.set(1.58,2.37,1);sprite.center.set(.5,44/384);
    this.root.add(sprite);this.passo(0,'Idle',true);
  }
  passo(dt:number,movimento:MovimentoAvatar,parado=false,velocidade=.8) {
    if(this.encerrado)return;
    const pose=this.marcha.atualizar(dt,movimento,velocidade,parado);
    this.root.getWorldQuaternion(this.quaternion);
    this.direcao.set(0,0,1).applyQuaternion(this.quaternion);
    const horizontal=this.direcao.x-this.direcao.z;
    if(movimento==='Walk'&&velocidade>.02&&Math.abs(horizontal)>.2)this.espelhar=horizontal<0;
    const chave=`${movimento}:${parado}:${this.espelhar}`;
    this.acumulado+=dt;
    if(chave===this.anterior&&(parado||this.acumulado<1/FPS_PIXEL))return;
    this.acumulado=Number.isFinite(this.acumulado)?this.acumulado%(1/FPS_PIXEL):0;this.anterior=chave;
    desenharPixel(this.ctx,this.recursos,this.ap,this.marcha.tempo,this.marcha.fase,movimento,parado,this.espelhar,pose);
    this.textura.needsUpdate=true;
  }
  opacidade(valor:number){this.material.opacity=valor;}
  destruir(){this.encerrado=true;this.textura.dispose();this.material.dispose();this.root.clear();this.canvas.width=0;this.canvas.height=0;}
}
