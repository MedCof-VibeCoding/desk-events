import * as THREE from 'three';
import type { Aparencia } from './supabase';
import { ACESSORIOS_PIXEL, equipamentosDe, pixelDe } from './pixelCatalogo';
import { CORES_CALCA, CORES_CALCADO, CORES_ROUPA, roupaDe } from './pixelRoupas';

// The new cast uses the reference GLB's skin weights, bones and animation clips.
// Rebuild the illustrated cast around that rig; never scale bones or stride.
const IDENTIDADES = {
  leo: { pele:'#efb580', cabelo:'#914b2d', corte:'curto' },
  violeta: { pele:'#edaf82', cabelo:'#843fa0', corte:'longo' },
  neo: { pele:'#e7ad7c', cabelo:'#28588d', corte:'crista' },
  mika: { pele:'#f4ba91', cabelo:'#e7548c', corte:'bob' },
  orbit: { pele:'#e5e1ed', cabelo:'#16344e', corte:'robo' },
  davi: { pele:'#a96136', cabelo:'#292330', corte:'crespo' },
  flora: { pele:'#f0bc90', cabelo:'#42832c', corte:'longo' },
  nox: { pele:'#393044', cabelo:'#393044', corte:'sombra' },
  sol: { pele:'#edb985', cabelo:'#f1bc50', corte:'longo' },
  zuri: { pele:'#35c4c4', cabelo:'#973cae', corte:'crista' }
} as const;

export function personalizarAvatar3D(modelo:THREE.Object3D, ap:Aparencia):THREE.BufferGeometry[] {
  const id = pixelDe(ap).id, identidade = IDENTIDADES[id], roupa = roupaDe(ap);
  const geometrias:THREE.BufferGeometry[] = [];
  const bones = new Map<string,THREE.Bone>();
  const malhas:THREE.SkinnedMesh[] = [];
  modelo.traverse(o => { if ((o as THREE.Bone).isBone) bones.set(o.name,o as THREE.Bone); if ((o as THREE.SkinnedMesh).isSkinnedMesh) malhas.push(o as THREE.SkinnedMesh); });
  const pele = new THREE.Color(identidade.pele);
  const cima = new THREE.Color(CORES_ROUPA.find(c=>c.id===roupa.superior)!.cor);
  const calca = new THREE.Color(CORES_CALCA.find(c=>c.id===roupa.inferior)!.cor);
  const sapato = new THREE.Color(CORES_CALCADO.find(c=>c.id===roupa.calcado)!.cor);
  for (const mesh of malhas) {
    const geo = mesh.geometry.clone(); mesh.geometry = geo; geometrias.push(geo);
    const cores = geo.getAttribute('color'), indices = geo.getAttribute('skinIndex'), pesos = geo.getAttribute('skinWeight'), posicoes=geo.getAttribute('position');
    const remover = new Set<number>();
    const ponto=new THREE.Vector3(),eixoA=new THREE.Vector3(),eixoB=new THREE.Vector3();
    const mundoParaMalha=mesh.matrixWorld.clone().invert();
    const naMalha=(nome:string,v:THREE.Vector3)=>bones.get(nome)!.getWorldPosition(v).applyMatrix4(mundoParaMalha);
    for (let i=0;i<cores.count;i++) {
      const pesosVertice=[pesos.getX(i),pesos.getY(i),pesos.getZ(i),pesos.getW(i)];
      const dominante=pesosVertice.indexOf(Math.max(...pesosVertice));
      const osso=mesh.skeleton.bones[[indices.getX(i),indices.getY(i),indices.getZ(i),indices.getW(i)][dominante]].name;
      const r=cores.getX(i),g=cores.getY(i);
      // The 2D cast wears straight, roomy trousers and chunky sneakers.
      const lado=osso.slice(-1);
      if(id!=='orbit'&&/^(Thigh|Shin)[LR]$/.test(osso)) {
        naMalha(`Thigh${lado}`,eixoA);naMalha(`Foot${lado}`,eixoB);
        ponto.fromBufferAttribute(posicoes,i);
        const t=THREE.MathUtils.clamp((ponto.y-eixoA.y)/(eixoB.y-eixoA.y),0,1);
        const cx=THREE.MathUtils.lerp(eixoA.x,eixoB.x,t),cz=THREE.MathUtils.lerp(eixoA.z,eixoB.z,t)+.01;
        const f=1+.32*t; // shins widen to the thigh's width
        posicoes.setXYZ(i,cx+(ponto.x-cx)*f,ponto.y,cz+(ponto.z-cz)*f);
      }
      const cabeca=/^(Head|Eye|Mouth)/.test(osso);
      // The old head, hoodie strings, badge and cuffs belong to the legacy cast.
      const tronco=/^(Chest|Spine|Hips)$/.test(osso);
      const detalheTronco=tronco && !(Math.abs(r-.5089)<.001 || Math.abs(r-.3372)<.001 || (osso==='Hips'&&r<.12) || (osso==='Chest'&&Math.abs(r-.5841)<.001));
      const punho=/^Forearm/.test(osso)&&Math.abs(r-.3419)<.001;
      const membroRobo=id==='orbit'&&/^(Arm|Forearm|Thigh|Shin)/.test(osso);
      // Torso details (badge, hoodie strings) are part of the shirt surface: removing them
      // opens holes that show the outline from inside, so they are only recoloured.
      if (cabeca || punho || membroRobo) remover.add(i);
      // The badge ring shares the shirt colour; it is the only torso part this far forward.
      const argola=osso==='Spine'&&Math.abs(posicoes.getX(i))<.06&&posicoes.getZ(i)>.175;
      if (detalheTronco||argola) {
        // Sink the legacy badge/strings just under the shirt so neither they nor their outline show.
        ponto.fromBufferAttribute(posicoes,i);naMalha('Chest',eixoA);
        const dx=ponto.x-eixoA.x,dz=ponto.z-eixoA.z,d=Math.hypot(dx,dz)||1;
        posicoes.setXYZ(i,ponto.x-dx/d*.05,ponto.y,ponto.z-dz/d*.05);
      }
      let cor:THREE.Color|undefined, sombra=1;
      if (/^Foot/.test(osso)) { cor=id==='orbit'&&roupa.calcado==='cinza'?new THREE.Color('#ddd9e5'):r>.65?new THREE.Color('#f1eee8'):sapato; }
      else if (/^(Thigh|Shin)/.test(osso)||(osso==='Hips'&&r<.12)) { cor=id==='orbit'&&roupa.inferior==='grafite'?pele:calca; }
      else if (/^Hand/.test(osso)&&id==='orbit') {cor=new THREE.Color('#252839');}
      else if (roupa.modelo==='basica'&&/^(Forearm|Arm)/.test(osso)) {cor=pele;}
      else if (/^(Hand|Neck)/.test(osso)||(osso==='Head'&&r>.3)||(osso==='Chest'&&r>.55&&g>.2&&g<.3)) { cor=pele; }
      else if (!cabeca) { cor=cima; }
      if (cor) cores.setXYZ(i,Math.min(1,cor.r*sombra),Math.min(1,cor.g*sombra),Math.min(1,cor.b*sombra));
    }
    // Preserve triangles crossing limb joints, but recolor even their removed-side
    // vertices so the source model's brown sleeves cannot leak into the shoulders.
    const antigos=geo.index;
    const novos:number[]=[];
    for(let i=0;i<(antigos?.count??cores.count);i+=3) {
      const tri=[0,1,2].map(k=>antigos?antigos.getX(i+k):i+k);
      if(!tri.every(v=>remover.has(v))) novos.push(...tri);
    }
    geo.setIndex(novos); cores.needsUpdate=true; posicoes.needsUpdate=true;
    geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
  }
  const materiais=new Map<string,THREE.MeshStandardMaterial>();
  function material(cor:string,metal=false) {
    const chave=cor+metal;
    if(!materiais.has(chave)) materiais.set(chave,new THREE.MeshStandardMaterial({color:cor,roughness:metal?.35:.75,metalness:metal?.4:0}));
    return materiais.get(chave)!;
  }
  function peca(parent:THREE.Object3D,geo:THREE.BufferGeometry,cor:string,x:number,y:number,z:number,metal=false) {
    geometrias.push(geo);const mesh=new THREE.Mesh(geo,material(cor,metal));mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  }
  function bola(p:THREE.Object3D,c:string,x:number,y:number,z:number,sx:number,sy:number,sz:number) {
    const m=peca(p,new THREE.SphereGeometry(1,16,12),c,x,y,z);m.scale.set(sx,sy,sz);return m;
  }
  function caixa(p:THREE.Object3D,c:string,x:number,y:number,z:number,sx:number,sy:number,sz:number) {return peca(p,new THREE.BoxGeometry(sx,sy,sz),c,x,y,z);}
  function aro(p:THREE.Object3D,c:string,x:number,y:number,z:number,r:number,t=.018) {return peca(p,new THREE.TorusGeometry(r,t,8,24),c,x,y,z);}
  function prender(osso:string,nome:string) {
    const bone=bones.get(osso);if(!bone) throw Error(`Osso ausente: ${osso}`);
    const group=new THREE.Group();group.name=nome;
    // Shapes are authored upright in the bind pose, including hand accessories.
    group.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()).invert());bone.add(group);return group;
  }
  function curva(p:THREE.Object3D,c:string,pontos:number[][],raio=.012,nome='') {
    const mesh=peca(p,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pontos.map(v=>new THREE.Vector3(...v))),20,raio,6,false),c,0,0,0);
    mesh.name=nome;return mesh;
  }
  function mecha(p:THREE.Object3D,c:string,pontos:number[][],largura:number) {
    // A tapered lock follows a curved centreline, rather than a row of balls.
    const caminho=new THREE.CatmullRomCurve3(pontos.map(v=>new THREE.Vector3(...v)));
    const geo=new THREE.TubeGeometry(caminho,16,largura,8,false),pos=geo.getAttribute('position');
    for(let j=0;j<=16;j++) {
      const t=j/16,centro=caminho.getPointAt(t),fator=.015+.985*Math.pow(Math.sin(Math.PI*(.13+t*.87)),.6);
      for(let k=0;k<=8;k++) {
        const i=j*9+k,v=new THREE.Vector3().fromBufferAttribute(pos,i).sub(centro).multiplyScalar(fator).add(centro);
        pos.setXYZ(i,v.x,v.y,v.z);
      }
    }
    geo.computeVertexNormals();return peca(p,geo,c,0,0,0);
  }
  function ponta(p:THREE.Object3D,c:string,base:number[],direcao:number[],comprimento:number,raio:number) {
    // Pointed lock for spiky cuts: base sits inside the scalp, tip follows the direction.
    const geo=new THREE.ConeGeometry(raio,comprimento,7,1);geo.translate(0,comprimento/2,0);
    const m=peca(p,geo,c,base[0],base[1],base[2]);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...direcao).normalize());
    return m;
  }
  function detalhe(m:THREE.Mesh){m.userData.semContorno=true;return m;}
  const head=prender('Head',`identidade-${id}`),hair=identidade.cabelo;
  let cabelo:THREE.Group|null=null;
  if (identidade.corte==='robo'||identidade.corte==='sombra') {
    const robo=id==='orbit',luz=robo?'#35eeeb':'#ffc323';
    bola(head,identidade.pele,0,.255,0,.355,.33,.29).name='cabeca-base';
    if(robo) {
      bola(head,'#a4a1b5',0,.24,.225,.295,.249,.086);
      bola(head,'#151d2f',0,.24,.26,.27,.219,.068).name='visor-orbit';
      curva(head,'#a4a1b5',[[-.14,.535,.13],[-.09,.484,.231],[0,.47,.26],[.09,.484,.231],[.14,.535,.13]],.009);
      for(const x of [-.349,.349]) bola(head,'#b5afc2',x,.25,0,.025,.12,.11);
    }
    for(const x of [-.125,.125]) {
      const olho=curva(head,luz,[[x-.063,.257,robo?.317:.264],[x-.035,.297,robo?.329:.277],[x,.308,robo?.336:.282],[x+.035,.297,robo?.329:.277],[x+.063,.257,robo?.317:.264]],.016,'olho-sorridente');
      (olho.material as THREE.MeshStandardMaterial).emissive.set(luz);
      (olho.material as THREE.MeshStandardMaterial).emissiveIntensity=.6;
    }
    curva(head,robo?luz:'#211d2b',[[-.06,.16,robo?.324:.28],[0,.135,robo?.332:.292],[.06,.16,robo?.324:.28]],.01,'sorriso');
  } else {
    bola(head,identidade.pele,0,.24,0,.32,.305,.27).name='cabeca-base';
    for(const lado of [-1,1]) {
      if(id==='flora') {
        const orelha=mecha(head,identidade.pele,[[lado*.275,.22,.02],[lado*.38,.27,.03],[lado*.48,.335,.02]],.07);
        orelha.name='orelha-elfica';
      } else bola(head,identidade.pele,lado*.315,.22,0,.06,.079,.055);
      bola(head,id==='zuri'?'#24958e':'#d88b68',lado*.323,.221,.04,.027,.043,.018);
      const x=lado*.122,iris=id==='flora'?'#36552d':id==='zuri'?'#123f4c':'#3d2617';
      // Pixel-art eyes: one dark oval sitting on the face, two catch-lights, no white ball.
      bola(head,'#1a1218',x,.258,.236,.072,.092,.03).name='olho';
      detalhe(bola(head,iris,x,.248,.256,.054,.066,.014));
      detalhe(bola(head,'#ffffff',x-lado*.006-.02,.288,.266,.024,.028,.006)).name='brilho-olho';
      detalhe(bola(head,'#ffffff',x+.022,.222,.265,.011,.011,.004));
      detalhe(curva(head,'#1a1218',[[x-.07,.31,.226],[x,.352,.24],[x+.07,.31,.226]],.012,'cilio'));
      detalhe(curva(head,new THREE.Color(hair).multiplyScalar(.7).getStyle(),[[x-.058,.398,.212],[x,.41,.226],[x+.058,.398,.212]],.011,'sobrancelha'));
      if(['violeta','mika','flora','sol'].includes(id)) detalhe(curva(head,'#1a1218',[[x+lado*.06,.318,.222],[x+lado*.082,.335,.214],[x+lado*.1,.344,.2]],.008));
      const rubor=new THREE.Color(identidade.pele).lerp(new THREE.Color(id==='zuri'?'#2aa6a8':'#ff8a86'),.38).getStyle();
      detalhe(bola(head,rubor,lado*.19,.172,.205,.048,.026,.014)).name='rubor';
    }
    detalhe(bola(head,new THREE.Color(identidade.pele).multiplyScalar(.9).getStyle(),0,.172,.262,.018,.016,.012));
    detalhe(curva(head,id==='zuri'?'#164f58':'#6e2a2c',[[-.068,.112,.232],[-.035,.088,.243],[0,.082,.246],[.035,.088,.243],[.068,.112,.232]],.012,'sorriso'));
    if(id==='davi') curva(head,'#372a2b',[[-.16,.047,.175],[-.08,-.004,.19],[0,-.025,.2],[.08,-.004,.19],[.16,.047,.175]],.013);
    const cab=new THREE.Group();cab.name='cabelo';head.add(cab);cabelo=cab;
    // Scalp is open at the forehead; locks define each silhouette from the atlas.
    peca(cab,new THREE.SphereGeometry(.335,24,14,0,Math.PI*2,0,Math.PI*.52),hair,0,.32,-.035).scale.set(1,.78,.91);
    const brilho=new THREE.Color(hair).lerp(new THREE.Color('#ffffff'),.045).getStyle();
    if(identidade.corte==='longo'||identidade.corte==='bob') {
      const longo=identidade.corte==='longo';
      bola(cab,hair,0,longo?-.2:.2,-.2,longo?.4:.33,longo?.7:.3,.15);
      // Waist-length, wavy volume that frames the shoulders, as in the 2D art.
      for(const lado of [-1,1]) for(let n=0;n<(longo?4:3);n++) {
        const x=lado*(.28+n*.04),z=-.02-n*.09,w=lado*.06;
        const pontos=longo
          ? [[lado*.075,.555,-.035],[x,.43,z],[x+w,.25,z],[x,.08,z+.02],[x+w*1.6,-.1,z],[x+w*.6,-.28,z+.02],[x+w*1.7,-.46,z],[x+w*.8,-.64,z-.02],[x+w*1.3,-.8,z],[x+w*.9,-.9,z]].slice(0,n===0?6:10)
          : [[lado*.075,.555,-.035],[x,.43,z],[x+lado*.045,.25,z],[x+lado*.04,.10,z+.025],[x+lado*.01,.0,z-.025]];
        mecha(cab,n===1?brilho:hair,pontos,longo?.115:.1);
      }
      if(id==='sol'||id==='violeta') {
        for(const lado of [-1,1]) for(let n=0;n<2;n++) mecha(cab,n?brilho:hair,[[lado*.025,.56,.04],[lado*.13,.52,.19],[lado*(.24+n*.025),.39,.23],[lado*.30,.26,.12]],.08);
      } else for(let n=0;n<3;n++) mecha(cab,n===1?brilho:hair,[[.08+n*.045,.57,.04],[-.035+n*.03,.50,.22],[-.19+n*.04,.37,.242],[-.28+n*.025,.28,.12]],.074);
    } else if(identidade.corte==='crespo') {
      for(let row=0;row<3;row++) for(let n=0;n<12;n++) {
        const a=n*Math.PI/6+row*.22,raio=.29-row*.065;
        bola(cab,n%4===0?brilho:hair,Math.cos(a)*raio,.395+row*.072,Math.sin(a)*raio-.02,.065,.067,.065);
      }
      bola(cab,hair,0,.57,-.02,.12,.065,.12);
    } else {
      // Spiky cuts: Léo is tousled, Neo stands up, Zuri sweeps to one side.
      const centro=[0,.36,-.03];
      const perfil=id==='neo'?{n:11,elev:[.7,1.45],comp:[.28,.38],raio:.105,inclina:[.05,0]}
        :id==='zuri'?{n:8,elev:[.75,1.2],comp:[.26,.34],raio:.1,inclina:[.55,0]}
        :{n:12,elev:[.35,1.15],comp:[.2,.27],raio:.11,inclina:[0,0]};
      for(let n=0;n<perfil.n;n++) {
        const a=-Math.PI*.15+n/(perfil.n-1)*Math.PI*1.3+(n%2)*.12; // around the crown, fewer at the back
        const elev=perfil.elev[0]+(perfil.elev[1]-perfil.elev[0])*((n*37)%10)/10;
        const dir=[Math.cos(a)*Math.cos(elev)+perfil.inclina[0],Math.sin(elev),-Math.sin(a)*Math.cos(elev)*.9];
        const len=Math.hypot(...dir),u=dir.map(v=>v/len);
        const base=[centro[0]+u[0]*.2,centro[1]+u[1]*.17,centro[2]+u[2]*.2];
        ponta(cab,n%3===1?brilho:hair,base,dir,perfil.comp[0]+(perfil.comp[1]-perfil.comp[0])*((n*53)%10)/10,perfil.raio).name='ponta-cabelo';
      }
      // Fringe locks fall over the forehead and stop above the brows.
      for(let n=0;n<4;n++) {
        const x=-.18+n*.12;
        ponta(cab,n===1?brilho:hair,[x,.53,.13],[id==='zuri'?.55:(n<2?-.25:.25),-1,.75],.2,.085);
      }
      if(id==='zuri') for(let n=0;n<3;n++) detalhe(curva(cab,'#1d5866',[[.3,.27+n*.04,-.04],[.322,.28+n*.04,.04],[.295,.3+n*.04,.12]],.011));
    }
  }
  if(id==='orbit') {
    const branco='#e5e1ed',junta='#252839';
    // Each plate follows its own limb, leaving the elbow/knee articulation exposed.
    function segmento(inicio:string,fim:string,cor:string,largura:number,profundidade:number) {
      const g=prender(inicio,`armadura-${inicio}`),a=bones.get(inicio)!.getWorldPosition(new THREE.Vector3()),b=bones.get(fim)!.getWorldPosition(new THREE.Vector3());
      const delta=b.sub(a),centro=delta.clone().multiplyScalar(.52);
      const geo=new THREE.CylinderGeometry(largura*.8,largura,delta.length()*.76,10,1);
      // Broad armour shells, instead of cloth sleeves or spherical limbs.
      const m=peca(g,geo,cor,centro.x,centro.y,centro.z,true);m.scale.z=profundidade/largura;
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
      bola(g,junta,0,0,0,largura*.73,largura*.73,profundidade*.8);
    }
    for(const lado of ['L','R']) {
      segmento(`Arm${lado}`,`Forearm${lado}`,roupa.modelo==='basica'?branco:CORES_ROUPA.find(c=>c.id===roupa.superior)!.cor,.089,.087);
      segmento(`Forearm${lado}`,`Hand${lado}`,branco,.077,.073);
      const perna=roupa.inferior==='grafite'?branco:CORES_CALCA.find(c=>c.id===roupa.inferior)!.cor;
      segmento(`Thigh${lado}`,`Shin${lado}`,perna,.098,.103);
      segmento(`Shin${lado}`,`Foot${lado}`,perna,.087,.086);
    }
  }
  if(roupa.modelo==='basica'&&id!=='orbit') for(const lado of ['L','R']) {
    // A separate short sleeve keeps a crisp hem instead of a skin-to-shirt gradient.
    const g=prender(`Arm${lado}`,`manga-${lado}`),a=bones.get(`Arm${lado}`)!.getWorldPosition(new THREE.Vector3()),b=bones.get(`Forearm${lado}`)!.getWorldPosition(new THREE.Vector3());
    const delta=b.sub(a),comprimento=delta.length()*.55;
    const geo=new THREE.CylinderGeometry(.098,.108,comprimento,14,1);geo.translate(0,-comprimento/2+.03,0);
    const m=peca(g,geo,CORES_ROUPA.find(c=>c.id===roupa.superior)!.cor,0,0,0);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),delta.normalize());
  }
  if(id!=='orbit') for(const lado of ['L','R']) {
    // Chunky sneakers as a shell on the foot bone: the skinned foot (and its stride) stays untouched.
    const g=prender(`Foot${lado}`,`tenis-${lado}`),cor=CORES_CALCADO.find(c=>c.id===roupa.calcado)!.cor;
    bola(g,cor,0,.0,.07,.118,.082,.185);
    const sola=bola(g,roupa.calcado==='branco'?'#cfcac2':'#f1eee8',0,-.05,.07,.128,.04,.198);sola.name='sola';
    detalhe(caixa(g,'#f1eee8',0,.05,.16,.09,.012,.07));
  }
  const torso=prender('Chest',`roupa-${roupa.modelo}`);
  const camisa=CORES_ROUPA.find(c=>c.id===roupa.superior)!.cor;
  function painel(cor:string,pontos:number[][],z=.206) {
    const forma=new THREE.Shape(pontos.map(([x,y])=>new THREE.Vector2(x,y)));
    return peca(torso,new THREE.ExtrudeGeometry(forma,{depth:.009,bevelEnabled:false}),cor,0,0,z);
  }
  if(roupa.modelo==='casual'||roupa.modelo==='executiva') {
    if(roupa.modelo==='executiva') {
      painel('#eee8dc',[[-.07,.14],[.07,.14],[0,-.05]]);
      const lapela=new THREE.Color(camisa).lerp(new THREE.Color('#ffffff'),.12).getStyle();
      for(const lado of [-1,1]) painel(lapela,[[lado*.085,.14],[lado*.125,.07],[lado*.04,-.015],[0,-.09],[lado*.055,.06]],.218);
      for(const y of [-.14,-.2]) bola(torso,'#d7c0a0',0,y,.226,.011,.011,.006);
      for(const x of [-.13,.13]) caixa(torso,'#252a3b',x,-.17,.213,.065,.012,.009);
    } else {
      painel('#e7e2d7',[[-.048,.135],[.048,.135],[.065,-.235],[-.065,-.235]]);
      for(const x of [-.13,.13]) caixa(torso,'#8990a0',x,-.04,.218,.052,.012,.009);
    }
  }
  if(roupa.modelo==='futurista') {
    for(const lado of [-1,1]) curva(torso,'#4ee1e5',[[lado*.145,.07,.211],[lado*.145,-.10,.211],[lado*.075,-.10,.211]],.008);
    caixa(torso,'#4ee1e5',0,.055,.211,.014,.15,.012);
    caixa(torso,'#252a3b',0,-.24,.184,.34,.045,.035);
    caixa(torso,'#4ee1e5',0,-.24,.207,.055,.028,.012);
  }

  // ---- Acessórios: cada peça segue o desenho da prancha 2D e se encaixa na cabeça de cada personagem.
  const robo=identidade.corte==='robo'||identidade.corte==='sombra';
  const H={
    cy:robo?.255:.24, rx:robo?.355:.32,
    topo:identidade.corte==='crespo'?.63:robo?.585:.58,
    larg:robo?.37:identidade.corte==='crespo'||identidade.corte==='longo'?.37:.345,
    frente:id==='orbit'?.35:id==='nox'?.3:.29, olhoY:robo?.27:.26,
    orelhaX:robo?.375:.335, conchaX:robo?.375:identidade.corte==='longo'?.47:identidade.corte==='bob'?.42:.335, orelhaY:robo?.25:.215, base:robo?.45:.43
  };
  function brilhar(m:THREE.Mesh,cor:string,intensidade=.8){
    const mat=(m.material as THREE.MeshStandardMaterial).clone();mat.emissive.set(cor);mat.emissiveIntensity=intensidade;m.material=mat;return m;
  }
  function translucido(m:THREE.Mesh,opacidade:number){
    const mat=(m.material as THREE.MeshStandardMaterial).clone();mat.transparent=true;mat.opacity=opacidade;mat.depthWrite=false;
    mat.userData.opacidadeBase=opacidade;m.material=mat;m.userData.semContorno=true;return m;
  }
  function duasFaces(m:THREE.Mesh){const mat=(m.material as THREE.MeshStandardMaterial).clone();mat.side=THREE.DoubleSide;m.material=mat;m.userData.semContorno=true;return m;}
  function arco(p:THREE.Object3D,c:string,R:number,tubo:number,y:number,z=0,abertura=Math.PI) {
    // Half ring over the head, ear to ear (XY plane).
    const m=peca(p,new THREE.TorusGeometry(R,tubo,8,32,abertura),c,0,y,z);m.rotation.z=(Math.PI-abertura)/2;return m;
  }
  function anel(p:THREE.Object3D,c:string,rx:number,rz:number,tubo:number,x:number,y:number,z:number) {
    const m=peca(p,new THREE.TorusGeometry(1,tubo/Math.max(rx,rz),8,32),c,x,y,z);m.rotation.x=Math.PI/2;m.scale.set(rx,rz,Math.max(rx,rz));return m;
  }
  function placa(p:THREE.Object3D,c:string,forma:THREE.Shape,x:number,y:number,z:number,esp=.02) {
    const geo=new THREE.ExtrudeGeometry(forma,{depth:esp,bevelEnabled:true,bevelThickness:.004,bevelSize:.004,bevelSegments:1,curveSegments:16});
    geo.translate(0,0,-esp/2);return peca(p,geo,c,x,y,z);
  }
  const poly=(pts:number[][])=>new THREE.Shape(pts.map(([x,y])=>new THREE.Vector2(x,y)));
  function retang(w:number,h:number,r:number){
    const s=new THREE.Shape(),x=-w/2,y=-h/2;
    s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
  }
  function coracao(t:number){
    const s=new THREE.Shape();s.moveTo(0,-t*.9);s.bezierCurveTo(-t*1.3,-t*.1,-t*1.1,t*.95,-t*.45,t*.85);s.bezierCurveTo(-t*.15,t*.8,0,t*.55,0,t*.45);
    s.bezierCurveTo(0,t*.55,t*.15,t*.8,t*.45,t*.85);s.bezierCurveTo(t*1.1,t*.95,t*1.3,-t*.1,0,-t*.9);return s;
  }
  function moldura(externa:THREE.Shape,interna:THREE.Shape){externa.holes.push(new THREE.Path(interna.getPoints(24)));return externa;}
  function orelhaTriangular(p:THREE.Object3D,fora:string,dentro:string,lado:number,R:number,ang:number,alt:number) {
    const g=new THREE.Group();g.position.set(lado*Math.sin(ang)*R,H.cy+Math.cos(ang)*R-.02,0);g.rotation.z=-lado*ang*.8;p.add(g);
    placa(g,fora,poly([[-.09,0],[.09,0],[lado*.02,alt]]),0,0,0,.045);
    detalhe(placa(g,dentro,poly([[-.05,.02],[.05,.02],[lado*.015,alt*.72]]),0,0,.03,.01));
  }
  function flor(p:THREE.Object3D,petala:string,miolo:string,x:number,y:number,z:number,r:number,nx=0,ny=0,nz=1,neon=false) {
    const g=new THREE.Group();g.position.set(x,y,z);g.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(nx,ny,nz).normalize());p.add(g);
    for(let k=0;k<5;k++){const a=k*Math.PI*2/5;const m=bola(g,petala,Math.cos(a)*r*.62,Math.sin(a)*r*.62,0,r*.5,r*.5,r*.22);if(neon)brilhar(m,petala,.55);}
    const c=detalhe(bola(g,miolo,0,0,r*.12,r*.32,r*.32,r*.2));if(neon)brilhar(c,miolo,.6);
    return g;
  }
  function esconderTopoDoCabelo(tudo=false){
    if(!cabelo)return;
    if(tudo){cabelo.visible=false;return;}
    cabelo.traverse(o=>{if(o.name==='ponta-cabelo')o.visible=false;});
  }
  function chapeu(g:THREE.Object3D,copa:string,aba:string,faixa:string,raioAba:number,alturaCopa:number) {
    const rc=H.larg+.025;
    const c=peca(g,new THREE.SphereGeometry(rc,28,14,0,Math.PI*2,0,Math.PI/2),copa,0,H.base,-.01);c.scale.set(1,alturaCopa/rc,1);
    peca(g,new THREE.CylinderGeometry(raioAba,raioAba*.98,.03,40),aba,0,H.base,-.01);
    peca(g,new THREE.CylinderGeometry(rc*.985,rc,.07,28,1,true),faixa,0,H.base+.045,-.01);
    return rc;
  }
  const lateral=[-1,1];

  for(const [slot,acessorio] of Object.entries(equipamentosDe(ap))) {
    const item=ACESSORIOS_PIXEL.find(a=>a.id===acessorio)!;
    const nome=item.id;
    const flutua=nome==='drone';
    const bone=flutua?'Chest':slot==='mao'?'HandR':slot==='pulso'?'HandL':slot==='bolsa'?'Spine':slot==='pescoco'?'Chest':slot==='detalhe'&&nome==='broche-lua'?'Chest':'Head';
    const g=prender(bone,`acessorio-${item.id}`);
    g.userData.slot=slot;

    if(slot==='cabeca') {
      // Crown spikes would pierce bands and hats; the fringe and scalp stay.
      esconderTopoDoCabelo();
      const R=Math.max(H.larg+.035,H.topo-H.cy+.035);
      if(/^fone|^headset/.test(nome)) {
        const cores:Record<string,[string,string,string]>={
          'fone-azul':['#27406b','#3f7cc6','#1d2236'],'fone-ciano':['#d9dde6','#39d9dc','#2c3142'],
          'fone-gato':['#e2646f','#f2f0ee','#e2646f'],'fone-coelho':['#f2f0f4','#8c62c6','#39d3d0'],'headset':['#2c2f40','#e8e6ec','#38c9d2']
        };
        const [banda,concha,detalheCor]=cores[nome];
        const xConcha=Math.max(H.conchaX,R-.01)+.02;
        // The band is an ellipse from cup to cup, so it rests on the hair even over long, wide hair.
        const b=arco(g,banda,R,.032,H.cy);b.scale.x=xConcha/R;
        if(nome==='fone-ciano') brilhar(arco(g,'#3fe3e3',R+.006,.012,H.cy,.02,Math.PI*.7),'#3fe3e3',.9).scale.x=xConcha/R;
        for(const lado of lateral) {
          if(nome==='headset'&&lado<0) {bola(g,banda,-xConcha,H.cy-.02,0,.04,.09,.08);continue;}
          const x=lado*xConcha;
          const cup=peca(g,new THREE.CylinderGeometry(.11,.11,.08,24),concha,x,H.cy-.03,0);cup.rotation.z=Math.PI/2;
          const aro2=peca(g,new THREE.CylinderGeometry(.075,.075,.085,24),detalheCor,x+lado*.008,H.cy-.03,0);aro2.rotation.z=Math.PI/2;
          if(nome==='fone-ciano'||nome==='fone-coelho'||nome==='headset') brilhar(aro2,detalheCor,.7);
        }
        if(nome==='fone-gato') for(const lado of lateral) orelhaTriangular(g,'#e2646f','#f6c2c8',lado,R,.55,.2);
        if(nome==='fone-coelho') for(const lado of lateral) {
          const o=new THREE.Group();o.position.set(lado*.15,H.cy+R-.03,0);o.rotation.z=-lado*.3;g.add(o);
          bola(o,'#f2f0f4',0,.12,0,.055,.14,.04);detalhe(bola(o,'#f3b3d4',0,.12,.028,.03,.1,.018));
        }
        if(nome==='headset') {
          curva(g,'#2c2f40',[[xConcha,H.cy-.08,.06],[.27,H.cy-.17,.2],[.13,.11,H.frente-.02]],.013);
          brilhar(bola(g,'#e2646f',.11,.105,H.frente-.01,.026,.026,.026),'#e2646f',.5);
        }
        b.name='banda';
      } else if(nome.startsWith('vr')) {
        const luz=nome==='vr-coral'?'#ff5b5b':'#3ee8e3';
        arco(g,'#6a3fa0',R,.04,H.cy+.02).scale.x=(Math.max(H.conchaX,R-.01)+.02)/R;
        caixa(g,'#2b2c3a',0,H.olhoY,H.frente+.035,.56,.2,.11).name='visor-vr';
        brilhar(caixa(g,luz,0,H.olhoY,H.frente+.092,.22,.026,.01),luz,1.2);
        for(const lado of lateral){const c=peca(g,new THREE.CylinderGeometry(.1,.1,.07,24),'#e6e6ee',lado*(Math.max(H.conchaX,R-.01)+.02),H.cy-.02,0);c.rotation.z=Math.PI/2;
          const d=peca(g,new THREE.CylinderGeometry(.06,.06,.075,20),'#8d8fa0',lado*(Math.max(H.conchaX,R-.01)+.028),H.cy-.02,0);d.rotation.z=Math.PI/2;}
      } else if(nome==='capuz') {
        esconderTopoDoCabelo(true);
        const r=H.larg+.07;
        const capuz=peca(g,new THREE.SphereGeometry(r,28,18,Math.PI/2+.95,Math.PI*2-1.9,0,Math.PI*.78),'#2f2a37',0,H.cy+.04,-.03);
        capuz.scale.set(1,1.08,1.05);duasFaces(capuz);
        const borda=peca(g,new THREE.TorusGeometry(1,.09,8,32),'#e2646f',0,H.cy+.06,.205);borda.scale.set(.29,.36,1);
        peca(g,new THREE.CylinderGeometry(.24,.37,.2,24,1,true),'#2f2a37',0,-.12,-.02);
      } else if(nome==='bone'||nome==='gorro'||nome==='bucket'||nome.startsWith('chapeu')) {
        esconderTopoDoCabelo();
        const rc=H.larg+.025;
        if(nome==='bone') {
          const c=peca(g,new THREE.SphereGeometry(rc,28,14,0,Math.PI*2,0,Math.PI/2),'#2b2d44',0,H.base,-.01);c.scale.set(1,.62,1.02);
          const aba=peca(g,new THREE.CylinderGeometry(.27,.27,.03,24,1,false,-Math.PI/2,Math.PI),'#e8676f',0,H.base+.01,rc*.62);aba.scale.z=1.15;aba.rotation.x=.12;
          caixa(g,'#f0d7c8',0,H.base+.12,rc*.93,.13,.08,.02).rotation.x=-.5;
          bola(g,'#e8676f',0,H.base+rc*.62,-.01,.035,.025,.035);
          peca(g,new THREE.CylinderGeometry(rc*1.005,rc*1.005,.035,28,1,true),'#e8676f',0,H.base+.015,-.01);
        } else if(nome==='gorro') {
          const c=peca(g,new THREE.SphereGeometry(rc,28,14,0,Math.PI*2,0,Math.PI/2),'#7d48b8',0,H.base+.05,-.01);c.scale.set(1,.95,1);
          const punho=peca(g,new THREE.CylinderGeometry(rc+.02,rc+.025,.13,28,1),'#6a3aa3',0,H.base+.02,-.01);punho.name='punho-gorro';
          for(let k=0;k<14;k++){const a=k/14*Math.PI*2;detalhe(caixa(g,'#5b2f8f',Math.sin(a)*(rc+.027),H.base+.02,Math.cos(a)*(rc+.027)-.01,.012,.12,.012)).rotation.y=a;}
        } else if(nome==='bucket') {
          peca(g,new THREE.CylinderGeometry(rc*.78,rc,.24,28,1),'#2fa6a0',0,H.base+.11,-.01);
          peca(g,new THREE.CylinderGeometry(rc*.78,rc*.78,.02,28),'#2fa6a0',0,H.base+.23,-.01);
          const abaBucket=peca(g,new THREE.CylinderGeometry(rc+.005,rc+.14,.08,32,1,true),'#279690',0,H.base-.03,-.01);duasFaces(abaBucket);
          brilhar(peca(g,new THREE.CylinderGeometry(rc*.93,rc*.96,.03,28,1,true),'#68f0e8',0,H.base+.05,-.01),'#68f0e8',.9);
        } else {
          const [copa,aba,faixa]=nome==='chapeu-flor'?['#e9b955','#e2a943','#e0626a']:nome==='chapeu-social'?['#ead2a0','#e3c68c','#e0626a']:['#f1e6c8','#eadcb8','#2a2a38'];
          const rr=chapeu(g,copa,aba,faixa,.56,.27);
          if(nome==='chapeu-neon') brilhar(anel(g,'#ffd23a',.555,.555,.01,0,H.base+.017,-.01),'#ffd23a',1);
          flor(g,'#ee6e8a','#ffd75e',rr*.62,H.base+.08,rr*.78,.065,.6,0,.8);
        }
      } else if(nome==='coroa') {
        const y=H.topo-.04;
        duasFaces(peca(g,new THREE.CylinderGeometry(.19,.17,.09,24,1,true),'#e8b53a',0,y,-.02,true));
        for(let k=0;k<5;k++){const a=k/5*Math.PI*2;peca(g,new THREE.ConeGeometry(.045,.12,4),'#e8b53a',Math.sin(a)*.18,y+.1,Math.cos(a)*.18-.02,true);
          bola(g,'#f4cf5d',Math.sin(a)*.18,y+.165,Math.cos(a)*.18-.02,.025,.025,.025);}
        brilhar(peca(g,new THREE.OctahedronGeometry(.04),'#e0405a',0,y,.165),'#e0405a',.3);
        for(const lado of lateral) detalhe(bola(g,'#e0405a',lado*.11,y,.13,.022,.022,.012));
      } else {
        // Headbands: tiara, flower crowns and fox ears.
        const tilt=new THREE.Group();tilt.rotation.x=-.32;tilt.position.y=-.02;g.add(tilt);
        const cor=nome==='tiara-cristal'?'#d7d9e4':nome==='orelhas-raposa'?'#e07a3a':'#4b8a3a';
        arco(tilt,cor,R,.026,H.cy,0,Math.PI*1.05);
        if(nome==='tiara-cristal') {
          brilhar(peca(tilt,new THREE.OctahedronGeometry(.06),'#4fe0e4',0,H.cy+R+.04,.02),'#4fe0e4',.6).scale.set(.8,1.3,.6);
          for(const lado of lateral) for(const a of [.5,1.05]) brilhar(peca(tilt,new THREE.OctahedronGeometry(.028),'#4fe0e4',lado*Math.sin(a)*R,H.cy+Math.cos(a)*R+.015,.01),'#4fe0e4',.5);
        } else if(nome==='orelhas-raposa') {
          for(const lado of lateral) orelhaTriangular(tilt,'#e07a3a','#f3dcc0',lado,R,.5,.22);
        } else {
          const neon=nome==='flores-neon';
          for(let k=0;k<7;k++){
            const a=-1.25+k*(2.5/6),x=Math.sin(a)*R,y=H.cy+Math.cos(a)*R;
            if(k%2) bola(tilt,'#5aa246',x,y,.03,.05,.03,.045).rotation.z=a;
            else flor(tilt,neon?'#ffd23a':k%4?'#f2f0ea':'#ef6c76',neon?'#fff3a6':'#ffd75e',x,y+.01,.04,.06,Math.sin(a)*.4,Math.cos(a)*.6,.7,neon);
          }
        }
      }
    } else if(slot==='rosto') {
      const z=H.frente,y=H.olhoY,xs=.122;
      if(nome==='oculos-ar') {
        const v=translucido(brilhar(placa(g,'#4fe3ea',retang(.5,.13,.04),0,y,z,.015),'#4fe3ea',.7),.55);v.name='lente-ar';
        placa(g,'#d4d8e2',moldura(retang(.54,.17,.05),retang(.5,.13,.04)),0,y,z,.02);
      } else {
        const cor=nome==='oculos-redondo'?'#e3b23c':nome==='oculos-coracao'?'#e8676f':'#262330';
        for(const lado of lateral) {
          const ext=nome==='oculos-redondo'?new THREE.Shape().absarc(0,0,.085,0,Math.PI*2,false):nome==='oculos-coracao'?coracao(.1):retang(.19,nome==='oculos-sol'?.13:.12,.03);
          const int=nome==='oculos-redondo'?new THREE.Shape().absarc(0,0,.063,0,Math.PI*2,false):nome==='oculos-coracao'?coracao(.075):retang(.15,nome==='oculos-sol'?.095:.085,.02);
          placa(g,cor,moldura(ext,int),lado*xs,y,z,.022).name='armacao';
          if(nome==='oculos-sol'||nome==='oculos-coracao') detalhe(placa(g,'#2b2f3c',int,lado*xs,y,z-.004,.008));
        }
        caixa(g,cor,0,y+.02,z,.07,.02,.018);
      }
      for(const lado of lateral) curva(g,'#2a2a36',[[lado*.21,y+.02,z-.01],[lado*(H.rx-.015),y+.025,z*.55],[lado*(H.rx+.012),y+.03,0]],.01,'haste');
    } else if(slot==='bolsa') {
      // Spine space: hips around y −.12, chest front z ≈ .2, back z ≈ −.2.
      const mochila=nome.startsWith('mochila');
      if(mochila) {
        const [corpo,base,detalheCor]=nome==='mochila-coral'?['#e8676f','#2f3146','#d9dde6']:nome==='mochila-folha'?['#6aa53b','#4f8a2c','#e2b53c']:['#e6e7ee','#363a4c','#3fe0e4'];
        if(nome==='mochila-folha') {const f=bola(g,corpo,0,.12,-.28,.2,.27,.08);f.name='mochila';detalhe(curva(g,'#3f7524',[[0,-.12,-.36],[0,.12,-.365],[0,.36,-.33]],.012));}
        else {
          caixa(g,corpo,0,.12,-.28,.36,.42,.16).name='mochila';
          caixa(g,base,0,-.04,-.3,.37,.12,.17);
          caixa(g,nome==='mochila-tech'?'#d4d6df':corpo,0,.22,-.365,.3,.16,.02);
          const fecho=caixa(g,detalheCor,0,.17,-.38,.05,.05,.015);if(nome==='mochila-tech')brilhar(fecho,detalheCor,.9);
        }
        for(const lado of lateral) curva(g,nome==='mochila-folha'?'#4f8a2c':base,[[lado*.13,.3,-.2],[lado*.14,.4,-.02],[lado*.14,.3,.2],[lado*.15,.06,.215],[lado*.14,-.05,.15]],.026);
      } else if(nome==='pochete') {
        anel(g,'#2b2d3d',.245,.215,.02,0,-.12,0);
        bola(g,'#f1b92f',0,-.14,.235,.17,.09,.07).name='pochete';
        brilhar(caixa(g,'#3fe0e4',0,-.12,.3,.2,.014,.01),'#3fe0e4',.8);
        caixa(g,'#2b2d3d',.2,-.12,.18,.06,.05,.03);
      } else {
        const estilos:Record<string,[string,string]>={
          'bolsa-coral':['#e8676f','#d8545e'],'bolsa-palha':['#c98a44','#8e5a2a'],'bolsa-executiva':['#efe3c8','#b6966b'],
          'bolsa-holografica':['#f08ec6','#d9d6e6'],'bolsa-folha':['#55702f','#6b4a2c'],'pochete-utilitaria':['#333545','#24252f'],'bolsa-lua':['#8e63c9','#7a4fb8']
        };
        const [corpo,alca]=estilos[nome];
        const x=.3,y=nome==='bolsa-executiva'?-.25:-.16,z=.04;
        let b:THREE.Mesh;
        if(nome==='bolsa-lua') {b=bola(g,corpo,x,y,z,.075,.12,.15);brilhar(aro(g,'#f0c04c',x+.075,y+.02,z,.035,.01),'#f0c04c',.4).rotation.y=Math.PI/2;}
        else {b=caixa(g,corpo,x,y,z,.12,.23,.31);caixa(g,new THREE.Color(corpo).multiplyScalar(.9).getStyle(),x+.064,y+.055,z,.01,.12,.31);}
        b.name='bolsa';
        if(nome==='bolsa-holografica') translucido(b,.75);
        if(nome!=='bolsa-lua') detalhe(caixa(g,nome==='pochete-utilitaria'?'#e8676f':'#f0c04c',x+.072,y+.02,z,.012,.04,.05));
        if(nome==='bolsa-folha') detalhe(bola(g,'#e2b53c',x+.072,y-.03,z,.008,.045,.03));
        if(nome==='bolsa-executiva') {const al=aro(g,alca,x,y+.12,z,.075,.014);al.rotation.y=Math.PI/2;al.scale.y=1.2;}
        else curva(g,alca,[[x,y+.1,z+.08],[.15,.14,.22],[-.12,.34,.21],[-.2,.4,0],[-.12,.36,-.2],[.12,.12,-.21],[x,y+.1,z-.08]],.02);
      }
    } else if(slot==='pescoco') {
      // Chest space: collar ≈ y .19, front of the chest z ≈ .19.
      if(nome==='cracha') {
        for(const lado of lateral) curva(g,'#273049',[[lado*.11,.2,.08],[lado*.09,.12,.19],[lado*.02,-.06,.215]],.011);
        caixa(g,'#e8676f',0,-.12,.215,.11,.13,.018).name='cracha';
        for(const dy of [-.1,-.14]) detalhe(caixa(g,'#f6efe6',0,dy,.226,.06,.012,.004));
        caixa(g,'#c9ccd6',0,-.045,.215,.025,.03,.012);
      } else if(nome.startsWith('gravata')) {
        const cor=nome==='gravata-coral'?'#e8676f':'#8a55c4';
        bola(g,cor,0,.155,.175,.04,.035,.025).name='no-gravata';
        const t=placa(g,cor,poly([[-.03,.13],[.03,.13],[.055,-.15],[0,-.21],[-.055,-.15]]),0,0,.2,.016);t.rotation.x=-.12;
      } else if(nome==='borboleta'||nome==='laco-creme') {
        const cor=nome==='borboleta'?'#e8676f':'#f2e8d6',w=nome==='laco-creme'?1.25:1;
        for(const lado of lateral) placa(g,cor,poly([[0,0],[lado*.1*w,.055*w],[lado*.1*w,-.055*w]]),0,.15,.19,.03);
        bola(g,cor,0,.15,.205,.025,.028,.02);
        if(nome==='laco-creme') for(const lado of lateral) placa(g,cor,poly([[0,0],[lado*.06,-.13],[lado*.02,-.15]]),0,.14,.19,.012);
      } else if(nome==='fone-pescoco') {
        anel(g,'#2bbfc5',.15,.14,.012,0,.17,0).rotation.x=Math.PI/2+.35;
        for(const lado of lateral){curva(g,'#2bbfc5',[[lado*.1,.14,.12],[lado*.09,.06,.2],[lado*.08,.0,.21]],.009);bola(g,'#f2f2f4',lado*.08,-.02,.215,.03,.03,.03);}
        brilhar(caixa(g,'#2bbfc5',0,.11,.205,.06,.02,.015),'#3fe0e4',.8);
      } else if(nome==='lenco'||nome==='bandana') {
        const cor=nome==='lenco'?'#2aa5a5':'#e8676f';
        anel(g,cor,.15,.14,.035,0,.18,0).rotation.x=Math.PI/2+.35;
        if(nome==='bandana') {placa(g,cor,poly([[-.15,.14],[.15,.14],[0,-.06]]),0,0,.2,.02).rotation.x=-.15;detalhe(curva(g,'#f2e8d6',[[-.13,.12,.215],[0,-.04,.215],[.13,.12,.215]],.007));}
        else {bola(g,cor,0,.11,.2,.04,.035,.03);for(const lado of lateral) placa(g,cor,poly([[0,0],[lado*.09,-.1],[lado*.04,-.12]]),0,.1,.195,.015);}
      } else if(nome==='colar') {
        curva(g,'#c9ccd6',[[-.12,.19,.05],[-.08,.1,.18],[0,.04,.205],[.08,.1,.18],[.12,.19,.05]],.007);
        const estrela=new THREE.Shape();for(let k=0;k<10;k++){const a=Math.PI/2+k*Math.PI/5,r=k%2?.02:.045;const px=Math.cos(a)*r,py=Math.sin(a)*r;if(k)estrela.lineTo(px,py);else estrela.moveTo(px,py);}
        brilhar(placa(g,'#3fd6dc',estrela,0,.0,.21,.015),'#3fd6dc',.5);
      }
    } else if(slot==='pulso') {
      if(nome==='relogio') {
        anel(g,'#2b2d3d',.058,.058,.018,0,.04,0);
        const visor=placa(g,'#e8676f',retang(.07,.08,.015),.045,.04,.03,.02);visor.rotation.y=Math.PI*.3;
        detalhe(placa(g,'#20232f',retang(.05,.06,.01),.05,.04,.04,.006)).rotation.y=Math.PI*.3;
      } else {
        anel(g,'#2e3446',.062,.062,.024,0,.04,0);
        brilhar(anel(g,'#3fe0e4',.066,.066,.01,0,.04,0),'#3fe0e4',.8);
      }
    } else if(slot==='mao') {
      // HandR space: palm centre ≈ (0, −.06, 0); objects sit in front of the hand.
      if(nome==='drone') {
        const d=new THREE.Group();d.position.set(.46,.38,.1);g.add(d);
        bola(d,'#eeeef3',0,0,0,.1,.1,.1).name='drone';
        detalhe(bola(d,'#e8676f',0,.06,0,.07,.05,.07));
        brilhar(aro(d,'#3fe0e4',0,0,.092,.045,.012),'#3fe0e4',1);
        detalhe(bola(d,'#1b2030',0,0,.088,.035,.035,.01));
        brilhar(translucido(anel(d,'#3fe0e4',.08,.08,.008,0,-.17,0),.7) as THREE.Mesh,'#3fe0e4',1);
        d.userData.flutuar=true;
      } else if(nome==='maleta') {
        caixa(g,'#2f3142',0,-.27,.02,.08,.24,.34).name='maleta';
        detalhe(caixa(g,'#e8676f',.042,-.33,.02,.006,.012,.3));
        const al=aro(g,'#e8676f',0,-.12,.02,.055,.014);al.rotation.y=Math.PI/2;
      } else if(nome==='copo') {
        peca(g,new THREE.CylinderGeometry(.055,.045,.18,20),'#2f3142',0,-.05,.06).name='copo';
        peca(g,new THREE.CylinderGeometry(.058,.05,.07,20),'#e8676f',0,-.07,.06);
        peca(g,new THREE.CylinderGeometry(.06,.06,.035,20),'#2aa5a5',0,.05,.06);
      } else if(nome==='camera') {
        caixa(g,'#a48ad8',0,-.06,.08,.17,.12,.08).name='camera';
        const lente=peca(g,new THREE.CylinderGeometry(.045,.045,.05,20),'#2b2d3d',0,-.065,.13);lente.rotation.x=Math.PI/2;
        brilhar(detalhe(bola(g,'#3fe0e4',0,-.065,.158,.025,.025,.008)),'#3fe0e4',.6);
        curva(g,'#8a6cc4',[[-.08,-.03,.08],[-.1,.15,.02],[0,.25,0]],.01);
      } else if(nome==='controle') {
        bola(g,'#2f3142',0,-.06,.08,.13,.06,.05).name='controle';
        for(const lado of lateral) bola(g,'#e8676f',lado*.1,-.09,.07,.04,.04,.04);
        detalhe(caixa(g,'#e8676f',-.06,-.05,.125,.035,.01,.008));detalhe(caixa(g,'#e8676f',-.06,-.05,.125,.01,.035,.008));
        detalhe(bola(g,'#e8676f',.06,-.04,.125,.012,.012,.006));
      } else if(nome==='caneta') {
        const c=peca(g,new THREE.CylinderGeometry(.012,.006,.22,10),'#eef0f4',0,-.06,.05);c.rotation.z=.6;c.name='caneta';
        brilhar(bola(g,'#3fe0e4',-.062,-.15,.05,.012,.012,.012),'#3fe0e4',1);
      } else {
        const cores:Record<string,[string,string]>={tablet:['#e8676f','#232634'],caderno:['#2b3150','#f2e8d6'],holograma:['#2b2d3d','#3fe0e4']};
        const [moldura2,tela]=cores[nome];
        if(nome==='holograma') {
          peca(g,new THREE.CylinderGeometry(.07,.08,.03,20),moldura2,0,-.06,.09).name='base-holograma';
          brilhar(translucido(caixa(g,tela,0,.12,.09,.26,.17,.008),.6),tela,1.1);
        } else {
          const t=caixa(g,moldura2,-.01,-.08,.09,.2,.27,.025);t.name=nome;t.rotation.x=-.2;
          const face=detalhe(caixa(g,tela,-.01,-.08,.104,nome==='caderno'?.012:.165,nome==='caderno'?.27:.23,.006));face.rotation.x=-.2;
          if(nome==='caderno') {face.position.x=.085;detalhe(caixa(g,'#e8676f',.06,-.08,.104,.02,.272,.004)).rotation.x=-.2;}
        }
      }
    } else {
      // Small details: earrings, ear cuff, hair clips and the moon brooch.
      if(nome==='broche-lua') {
        const lua=new THREE.Shape().absarc(0,0,.045,Math.PI*.3,Math.PI*1.7,false);lua.absarc(.025,0,.035,Math.PI*1.6,Math.PI*.4,true);
        placa(g,'#8e63c9',lua,.13,.08,.2,.015).name='broche';
        brilhar(anel(g,'#f0c04c',.06,.025,.006,.13,.08,.205),'#f0c04c',.4).rotation.set(Math.PI/2,0,.3);
      } else if(nome==='argola') {
        const a=brilhar(aro(g,'#e8b53a',H.orelhaX+.01,H.orelhaY-.1,.02,.04,.011),'#e8b53a',.25);a.rotation.y=Math.PI/2;a.name='argola';
      } else if(nome==='ear-cuff') {
        const c=peca(g,new THREE.TorusGeometry(.05,.014,8,20,Math.PI*1.3),'#d7d9e4',H.orelhaX+.01,H.orelhaY+.03,0);c.rotation.y=Math.PI/2;c.name='ear-cuff';
        brilhar(detalhe(bola(g,'#3fe0e4',H.orelhaX+.035,H.orelhaY+.03,.03,.012,.03,.012)),'#3fe0e4',.8);
      } else {
        const p2=new THREE.Group();p2.position.set(.24,H.cy+.25,.17);p2.rotation.set(-.3,.6,0);g.add(p2);
        if(nome==='presilha-raio') placa(p2,'#f3c33b',poly([[-.02,.08],[.05,.08],[.015,.01],[.05,.01],[-.03,-.09],[0,-.01],[-.035,-.01]]),0,0,0,.02).name='presilha';
        else {for(const lado of lateral) placa(p2,'#e8676f',poly([[0,0],[lado*.07,.045],[lado*.07,-.045]]),0,0,0,.025);bola(p2,'#e8676f',0,0,.012,.02,.022,.016).name='presilha';}
      }
    }
  }
  return geometrias;
}
