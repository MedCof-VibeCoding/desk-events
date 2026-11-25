import * as THREE from 'three';
import { bloco, cilindro, planta, cadeira, sofa, estante, paletaEstilo } from './mobilia3d';
import { movelDe, type Estilo, type ItemAmbiente } from './ambientes';

export function descartarObjeto(obj: THREE.Object3D) {
  const geometrias = new Set<THREE.BufferGeometry>(), materiais = new Set<THREE.Material>();
  obj.traverse(o => { if (o instanceof THREE.Mesh) { geometrias.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materiais.add(m); } });
  geometrias.forEach(g=>g.dispose()); materiais.forEach(m=>m.dispose()); obj.removeFromParent();
}

export function montarMovel(item: ItemAmbiente, estilo: Estilo): THREE.Group {
  const d = movelDe(item.tipo)!; const g = new THREE.Group(), p = paletaEstilo(estilo);
  const cor = d.cor ? new THREE.MeshLambertMaterial({color:d.cor}) : p.carvalho;
  g.name = item.tipo; g.userData.movelId = item.id; g.position.set(item.x,d.superficie ? .88 : 0,item.z); g.rotation.y = item.giro*Math.PI/2;
  const box = (w:number,h:number,depth:number,x:number,y:number,z:number,m:THREE.Material=cor) => bloco(g,w,h,depth,x,y,z,m,.025);
  const cyl = (r:number,h:number,x:number,y:number,z:number,m:THREE.Material=cor) => cilindro(g,r,h,x,y,z,m);
  const mesa = (w=d.w,depth=d.d,h=.8) => { box(w,.12,depth,0,h,0); for(const x of [-w/2+.12,w/2-.12]) for(const z of [-depth/2+.12,depth/2-.12]) box(.07,h,.07,x,h/2,z,p.metal); };
  const monitor = (y=0, pequeno=false) => { const w=pequeno?.53:.78; box(w,.42,.06,0,y+.34,-.15,p.preto); box(w-.08,.33,.015,0,y+.35,-.112,new THREE.MeshLambertMaterial({color:'#47757B',emissive:'#142A30'})); box(.08,.16,.08,0,y+.09,-.15,p.metal); box(.35,.025,.22,0,y+.015,-.15,p.metal); box(.5,.025,.16,0,y+.02,.18,p.metal); };
  const suporte = (h:number) => { box(.05,h,.05,0,h/2,0,p.metal); box(d.w,.06,.09,0,.05,0,p.metal); box(.09,.06,d.d,0,.05,0,p.metal); };
  switch(d.forma) {
    case 'mesa': mesa(); break;
    case 'mesa-alta': mesa(d.w,d.d,1.2); break;
    case 'mesa-l': box(d.w,.12,.8,0,.8,-.5); box(.8,.12,1.8,-.85,.8,0); for(const [x,z] of [[-1,-.75],[1,-.75],[-1,.75]])box(.07,.8,.07,x,.4,z,p.metal); break;
    case 'ilha': mesa(); box(d.w, .38,.05,0,1.05,0,p.metal); break;
    case 'recepcao': box(d.w,1,d.d,0,.5,0,p.madeira); box(d.w+.05,.1,d.d+.05,0,1.05,0); box(d.w-.1,.65,.035,0,.52,.52,p.claro); break;
    case 'cadeira': cadeira(g,0,0,p,0,cor); break;
    case 'sofa': p.tecido.color.set(d.cor!); sofa(g,0,0,0,p); break;
    case 'poltrona': box(.95,.35,.9,0,.28,0); box(.95,.65,.18,0,.68,-.35); for(const x of [-.42,.42]) box(.15,.35,.9,x,.55,0); break;
    case 'banqueta': cyl(.28,.12,0,.7,0,p.vermelho); cyl(.05,.65,0,.35,0,p.metal); cyl(.25,.04,0,.04,0,p.preto); break;
    case 'redonda': case 'centro-redonda': { const h=d.forma==='redonda'?.8:.45; cyl(d.w/2,.1,0,h,0); cyl(.08,h,0,h/2,0,p.metal); cyl(d.w/3,.05,0,.04,0,p.metal); break; }
    case 'centro': mesa(d.w,d.d,.45); break;
    case 'estante': estante(g,0,0,p); break;
    case 'armario': case 'arquivo': case 'locker': case 'geladeira': {
      const h=d.forma==='armario'?.9:d.forma==='arquivo'?1.35:1.85;
      box(d.w,h,d.d,0,h/2,0,d.forma==='geladeira'?p.claro:cor);
      for(let n=0;n<3;n++){ box(d.w-.08,.018,.02,0,.2+n*h/3,d.d/2+.01,p.metal); box(.22,.035,.045,0,.35+n*h/3,d.d/2+.04,p.preto); }
      break;
    }
    case 'copa': box(d.w,1,d.d,0,.5,0,p.madeira); box(d.w,.1,d.d,0,1.05,0,p.claro); box(.55,.5,.4,-.65,1.35,0,p.preto); box(.38,.12,.03,-.65,1.38,.22,p.metal); cyl(.07,.15,-.65,1.18,.28,p.papel); for(const x of [.25,.5,.75]) cyl(.07,.15,x,1.18,0,p.papel); break;
    case 'bebedouro': box(.5,.9,.5,0,.5,0,p.claro); cyl(.22,.45,0,1.18,0,new THREE.MeshLambertMaterial({color:'#76B0CB'})); box(.15,.1,.05,0,.8,.28,p.metal); break;
    case 'quadro': case 'tv': case 'arte': { const h=d.forma==='arte'?1.1:1.5; suporte(h); box(d.w,.85,.09,0,h,0,p.metal); box(d.w-.08,.77,.025,0,h,.06,d.forma==='tv'?p.preto:p.claro); for(const x of [-.35,0,.35]) box(.2,.18,.03,x,h,.08,p.vermelho); break; }
    case 'ripas': for(let x=-.8;x<=.8;x+=.2) box(.08,1.7,.12,x,.85,0,p.madeira); break;
    case 'vidro': { const vidro=new THREE.MeshLambertMaterial({color:'#92B6BF',transparent:true,opacity:.4,depthWrite:false}); box(d.w,1.9,.06,0,.95,0,vidro); for(const x of [-.88,.88]) box(.05,1.95,.1,x,.98,0,p.metal); box(d.w,.05,.1,0,1.94,0,p.metal); break; }
    case 'acustica': box(d.w,1.6,.16,0,.85,0,p.vermelho); for(const x of [-.55,.55]) box(.08,.06,.3,x,.04,0,p.metal); break;
    case 'planta': case 'samambaia': case 'suculenta': planta(g,0,0,0,p,d.forma==='suculenta'?.27:d.forma==='samambaia'?.7:1); break;
    case 'luminaria': case 'luminaria-mesa': { const h=d.forma==='luminaria'?1.7:.45; cyl(d.w/3,.05,0,.03,0,p.metal); cyl(.025,h,0,h/2,0,p.metal); cilindro(g,d.w/2,.23,0,h,0,p.claro,d.w/3); break; }
    case 'tapete': box(d.w,.025,d.d,0,.035,0,cor); break;
    case 'tapete-redondo': cyl(d.w/2,.025,0,.035,0,cor); break;
    case 'monitor': monitor(); break;
    case 'notebook': box(.58,.025,.4,0,.025,0,p.metal); box(.58,.36,.025,0,.2,-.2,p.preto); box(.5,.29,.012,0,.2,-.18,new THREE.MeshLambertMaterial({color:'#53818D'})); break;
    case 'microfone': cyl(.1,.03,0,.02,0,p.preto); cyl(.025,.23,0,.14,0,p.metal); cyl(.07,.2,0,.32,0,p.preto); break;
    case 'camera': suporte(1.1); box(.4,.3,.35,0,1.25,0,p.preto); { const lens=cyl(.1,.18,0,1.25,.23,p.metal); lens.rotation.x=Math.PI/2; } break;
    case 'som': suporte(.9); box(.45,.7,.4,0,1.2,0,p.preto); for(const y of [1.05,1.38]) { const cone=cyl(.11,.02,0,y,.21,p.metal); cone.rotation.x=Math.PI/2; } break;
    case 'cabideiro': suporte(1.65); box(.55,.045,.045,0,1.5,0,p.madeira); box(.3,.65,.1,.15,1.15,0,p.vermelho); break;
    case 'lixeira': cyl(.2,.45,0,.23,0,p.metal); cyl(.17,.01,0,.46,0,p.preto); break;
    case 'impressora': mesa(); box(.65,.3,.45,0,1,0,p.claro); box(.45,.04,.3,0,1.18,0,p.papel); box(.45,.04,.03,0,.98,.24,p.preto); break;
  }
  // A paleta contém cores opcionais: libera as não utilizadas por este móvel.
  const usados = new Set<THREE.Material>(); g.traverse(o=>{if(o instanceof THREE.Mesh) for(const m of Array.isArray(o.material)?o.material:[o.material]) usados.add(m);});
  for(const m of [...Object.values(p),cor]) if(!usados.has(m)) m.dispose();
  return g;
}
