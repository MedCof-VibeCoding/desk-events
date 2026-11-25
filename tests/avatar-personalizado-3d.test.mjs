import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdir,readFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url),THREE=require('three');
const arquivo=resolve('node_modules/.cache/avatar-personalizado-3d-tests.cjs');
await mkdir(resolve('node_modules/.cache'),{recursive:true});
await build({stdin:{contents:`export * from './apps/desktop/src/avatar3d'; export * from './apps/desktop/src/pixelCatalogo'; export * from './apps/desktop/src/pixelRoupas'; export {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';`,resolveDir:process.cwd(),loader:'ts'},outfile:arquivo,bundle:true,platform:'node',format:'cjs',external:['three'],logLevel:'silent'});
const {AvatarAnimado,ModelosAvatar,GLTFLoader,PIXEL_PERSONAGENS,ACESSORIOS_PIXEL,ROUPAS_PIXEL}=require(arquivo);
after(()=>rm(arquivo,{force:true}));
const bytes=await readFile('apps/desktop/public/avatars/atlas-m-casual.glb');
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const base={corpo:'monitor',cor:'#ff6175',acessorio:null,estilo:'pixel',avatarPixel:'leo'};
function verticesPes(avatar) {
  const pontos=[];
  avatar.root.updateMatrixWorld(true);
  avatar.root.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||mesh.userData.contorno)return; // o contorno compartilha a geometria do corpo
    mesh.skeleton.update();
    const indices=mesh.geometry.attributes.skinIndex,pesos=mesh.geometry.attributes.skinWeight;
    for(let i=0;i<indices.count;i++) if(/^Foot/.test(mesh.skeleton.bones[indices.getX(i)].name)&&pesos.getX(i)>.9) pontos.push(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
  });
  return pontos;
}

test('os dez novos personagens têm malha 3D e a mesma trajetória de pés do modelo de referência',()=>{
  for(const p of PIXEL_PERSONAGENS) {
    const referencia=new AvatarAnimado(gltf),novo=new AvatarAnimado(gltf,{...base,avatarPixel:p.id});
    try {
      let skins=0,sprites=0;novo.root.traverse(o=>{if(o.isSkinnedMesh)skins++;if(o.isSprite)sprites++;});
      assert.ok(skins>0);assert.equal(sprites,0);
      assert.equal(novo.clips,referencia.clips,'reutiliza os próprios clipes originais');
      for(let quadro=0;quadro<30;quadro++) {
        referencia.passo(.04,'Walk',false,.8);novo.passo(.04,'Walk',false,.8);
        const a=verticesPes(referencia),b=verticesPes(novo);
        assert.ok(a.length>0);assert.equal(a.length,b.length);
        for(let i=0;i<a.length;i++) assert.ok(a[i].distanceTo(b[i])<1e-6,`${p.id}: pé alterou a passada`);
      }
      const bounds=new THREE.Box3().setFromObject(novo.root,true);
      assert.ok(Number.isFinite(bounds.min.y)&&Number.isFinite(bounds.max.y));
    } finally {referencia.destruir();novo.destruir();}
  }
});

test('todos os acessórios são volumes presos ao esqueleto e acompanham o aceno',()=>{
  for(const a of ACESSORIOS_PIXEL) {
    const avatar=new AvatarAnimado(gltf,{...base,acessorios:{[a.slot]:a.id}});
    try {
      const peca=avatar.root.getObjectByName(`acessorio-${a.id}`);
      assert.ok(peca,`peça ausente: ${a.id}`);assert.ok(peca.parent.isBone);
      let volume=0;peca.traverse(o=>{if(o.isMesh){o.geometry.computeBoundingBox();const d=o.geometry.boundingBox.getSize(new THREE.Vector3());if(d.x*d.y*d.z>0)volume++;}});
      assert.ok(volume>0,`${a.id}: não deve ser uma imagem plana`);
      if(a.slot==='mao') {
        const matrizes=[];
        for(let i=0;i<15;i++){avatar.passo(.08,'Wave');avatar.root.updateMatrixWorld(true);matrizes.push(peca.matrixWorld.clone());}
        assert.ok(matrizes.some(m=>!m.equals(matrizes[0])),`${a.id}: objeto deve acompanhar a mão`);
      }
    } finally {avatar.destruir();}
  }
});

test('roupas não alteram o rig e mudanças não contaminam geometrias compartilhadas',()=>{
  const originais=[];gltf.scene.traverse(o=>{if(o.isMesh)originais.push({geo:o.geometry,cores:o.geometry.attributes.color.array.slice(),indices:o.geometry.index.array.slice()});});
  for(const roupa of ROUPAS_PIXEL) {
    const avatar=new AvatarAnimado(gltf,{...base,roupaPixel:{modelo:roupa.id,superior:'coral',inferior:'jeans',calcado:'branco'},acessorios:{cabeca:'bone'}});
    assert.ok(avatar.root.getObjectByName(`roupa-${roupa.id}`));assert.ok(avatar.root.getObjectByName('acessorio-bone'));
    let destruida=0;const geos=new Set();avatar.root.traverse(o=>{if(o.isMesh){geos.add(o.geometry);assert.ok(!originais.some(g=>g.geo===o.geometry));}});
    for(const g of geos)g.addEventListener('dispose',()=>destruida++);
    avatar.destruir();assert.equal(destruida,geos.size);
  }
  for(const o of originais){assert.deepEqual(o.geo.attributes.color.array,o.cores);assert.deepEqual(o.geo.index.array,o.indices);}
});

test('a integração carrega o rig 3D uma vez para os novos personagens, sem depender de atlas',async()=>{
  const carregar=GLTFLoader.prototype.loadAsync;let chamadas=0;
  GLTFLoader.prototype.loadAsync=async url=>{assert.equal(url,'/avatars/atlas-m-casual.glb');chamadas++;return gltf;};
  const modelos=new ModelosAvatar();
  try {
    const avatars=await Promise.all(PIXEL_PERSONAGENS.map(p=>modelos.criarAparencia({...base,avatarPixel:p.id})));
    assert.equal(chamadas,1);assert.ok(avatars.every(a=>a instanceof AvatarAnimado));
    avatars.forEach(a=>a.destruir());
  }finally{modelos.destruir();GLTFLoader.prototype.loadAsync=carregar;}
  assert.equal(await modelos.criarAparencia(base),null);
});

test('a superfície visível substitui o rosto legado e preserva a identidade das dez bases',()=>{
  for(const p of PIXEL_PERSONAGENS) {
    const avatar=new AvatarAnimado(gltf,{...base,avatarPixel:p.id});
    try {
      const cabeca=avatar.root.getObjectByName(`identidade-${p.id}`);
      assert.ok(cabeca.getObjectByName('cabeca-base'));
      assert.ok(cabeca.getObjectByName('sorriso'));
      const olhos=[];cabeca.traverse(o=>{if(o.name==='olho-sorridente'||o.name==='olho-branco'||o.name==='olho')olhos.push(o);});
      assert.equal(olhos.length,2);
      if(p.id==='orbit'||p.id==='nox') {
        assert.equal(olhos[0].material.color.getHexString(),p.id==='orbit'?'35eeeb':'ffc323');
        assert.equal(Boolean(cabeca.getObjectByName('visor-orbit')),p.id==='orbit');
      }
      if(p.id==='flora') {let orelhas=0;cabeca.traverse(o=>{if(o.name==='orelha-elfica')orelhas++;});assert.equal(orelhas,2);}
      avatar.root.traverse(mesh=>{
        if(!mesh.isSkinnedMesh)return;
        const geo=mesh.geometry,indices=geo.attributes.skinIndex,pesos=geo.attributes.skinWeight;
        for(const i of geo.index.array) {
          const w=[pesos.getX(i),pesos.getY(i),pesos.getZ(i),pesos.getW(i)],j=w.indexOf(Math.max(...w));
          const bone=mesh.skeleton.bones[indices.getComponent(i,j)].name;
          assert.ok(!/^(Head|Eye|Mouth)/.test(bone),'nenhuma superfície do rosto antigo pode reaparecer');
        }
      });
    }finally{avatar.destruir();}
  }
});

test('a armadura do Orbit acompanha os oito segmentos sem mudar as articulações',()=>{
  const avatar=new AvatarAnimado(gltf,{...base,avatarPixel:'orbit'});
  try {
    avatar.root.traverse(mesh=>{
      if(!mesh.isSkinnedMesh)return;
      const cores=mesh.geometry.attributes.color;
      for(const i of mesh.geometry.index.array) {
        const mangaLegada=Math.abs(cores.getX(i)-.5089)<.0001&&Math.abs(cores.getY(i)-.1221)<.0001;
        assert.ok(!mangaLegada,'triângulos nas junções não podem preservar a manga marrom do modelo antigo');
      }
    });
    const placas=[];
    for(const lado of ['L','R']) for(const parte of ['Arm','Forearm','Thigh','Shin']) {
      const placa=avatar.root.getObjectByName(`armadura-${parte}${lado}`);
      assert.ok(placa);assert.equal(placa.parent.name,`${parte}${lado}`);placas.push(placa);
    }
    avatar.root.updateMatrixWorld(true);
    const antes=placas.map(p=>p.matrixWorld.clone());
    for(let i=0;i<8;i++)avatar.passo(.06,'Walk',false,.8);
    avatar.root.updateMatrixWorld(true);
    for(let i=0;i<placas.length;i++)assert.ok(!placas[i].matrixWorld.equals(antes[i]));
  }finally{avatar.destruir();}
});

test('os personagens pixel usam sombra em faixas e contorno que acompanha o esqueleto',()=>{
  const avatar=new AvatarAnimado(gltf,{...base,avatarPixel:'violeta'});
  try {
    let toon=0,contornos=0,contornoSkinned=0;
    avatar.root.traverse(o=>{
      if(!o.isMesh)return;
      if(o.userData.contorno){contornos++;if(o.isSkinnedMesh){contornoSkinned++;assert.equal(o.skeleton,o.parent.skeleton);}assert.equal(o.material.side,THREE.BackSide);}
      else if(o.material.isMeshToonMaterial)toon++;
    });
    assert.ok(toon>0&&contornos>0&&contornoSkinned>0);
    assert.ok(avatar.root.getObjectByName('tenis-L')&&avatar.root.getObjectByName('manga-R'));
  }finally{avatar.destruir();}
});

test('acessórios de cabeça não atravessam o rosto em nenhum personagem',()=>{
  const livres=new Set(['vr-coral','vr-ciano','capuz','headset']);
  for(const p of PIXEL_PERSONAGENS) for(const a of ACESSORIOS_PIXEL.filter(x=>x.slot==='cabeca'&&!livres.has(x.id))) {
    const avatar=new AvatarAnimado(gltf,{...base,avatarPixel:p.id,acessorios:{cabeca:a.id}});
    try {
      avatar.root.updateMatrixWorld(true);
      const cabeca=avatar.root.getObjectByName(`identidade-${p.id}`),inv=cabeca.matrixWorld.clone().invert();
      avatar.root.getObjectByName(`acessorio-${a.id}`).traverse(o=>{
        if(!o.isMesh||o.userData.contorno)return;
        const pos=o.geometry.attributes.position,v=new THREE.Vector3();
        for(let i=0;i<pos.count;i++){
          v.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
          const rosto=Math.abs(v.x)<.15&&v.y>.05&&v.y<.33&&v.z>.2;
          assert.ok(!rosto,`${a.id} cobre o rosto de ${p.id}`);
        }
      });
    } finally {avatar.destruir();}
  }
});
