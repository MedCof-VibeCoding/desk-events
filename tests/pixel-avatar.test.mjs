import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdir,readFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const file=resolve('node_modules/.cache/pixel-avatar-tests.cjs');
await mkdir(resolve('node_modules/.cache'),{recursive:true});
await build({stdin:{contents:`export * from './apps/desktop/src/pixelCatalogo'; export * from './apps/desktop/src/pixelAtlas'; export * from './apps/desktop/src/pixelRender'; export * from './apps/desktop/src/personagens'; export * from './apps/desktop/src/AvatarEditor'; export * from './apps/desktop/src/pixelRoupas'; export * from './apps/desktop/src/pixelMarcha';`,resolveDir:process.cwd(),loader:'tsx'},outfile:file,bundle:true,platform:'node',format:'cjs',external:['react','react-dom','@supabase/supabase-js'],loader:{'.css':'empty'},define:{'import.meta.env':'{}'},jsx:'automatic',logLevel:'silent'});
const {ACESSORIOS_PIXEL,PIXEL_PERSONAGENS,PIXEL_ATLAS,ATLAS_PIXEL,equiparPixel,equipamentosDe,chavePixel,pixelDe,normalizarAparencia,carregarRecursosPixel,AvatarEditor,roupaDe,mudarRoupa,ROUPA_PADRAO,poseMarcha,passoPe,MarchaPixel,avancarPasso}=createRequire(import.meta.url)(file);
after(()=>rm(file,{force:true}));
const base={corpo:'monitor',cor:'#ff6175',acessorio:null,estilo:'pixel',avatarPixel:'leo'};

test('os 10 personagens e 60 acessórios apontam para recortes válidos dos PNGs reais',async()=>{
 assert.equal(PIXEL_PERSONAGENS.length,10);assert.equal(ACESSORIOS_PIXEL.length,60);
 assert.equal(new Set(ACESSORIOS_PIXEL.map(a=>a.id)).size,60);
 for(const [key,atlas]of Object.entries(PIXEL_ATLAS)){
  const png=await readFile('apps/desktop/public'+ATLAS_PIXEL[key]);
  assert.equal(png.readUInt32BE(16),atlas.width);assert.equal(png.readUInt32BE(20),atlas.height);
  assert.equal(png[25],6,'fundo transparente RGBA');
  for(const r of atlas.recortes){assert.ok(r.w>5&&r.h>5);assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=atlas.width&&r.y+r.h<=atlas.height);}
 }
 for(const a of ACESSORIOS_PIXEL)assert.ok(PIXEL_ATLAS[a.atlas].recortes[a.indice]);
});
test('trocas mantêm outras categorias; remover não altera o objeto salvo',()=>{
 const ap=equiparPixel(equiparPixel(base,'cabeca','bone'),'bolsa','bolsa-coral');
 const antes=JSON.stringify(ap),out=equiparPixel(ap,'cabeca','gorro');
 assert.equal(out.acessorios.bolsa,'bolsa-coral');assert.equal(out.acessorios.cabeca,'gorro');assert.equal(JSON.stringify(ap),antes);
 assert.equal(equiparPixel(out,'bolsa').acessorios.bolsa,undefined);
});
test('visor e óculos são mutuamente exclusivos nas duas ordens de escolha',()=>{
 const visor=equiparPixel(equiparPixel(base,'rosto','oculos-sol'),'cabeca','vr-coral');
 assert.equal(visor.acessorios.rosto,undefined);
 const oculos=equiparPixel(visor,'rosto','oculos-preto');
 assert.equal(oculos.acessorios.cabeca,undefined);assert.equal(oculos.acessorios.rosto,'oculos-preto');
});
test('dados desconhecidos e peças em categorias erradas são descartados',()=>{
 assert.deepEqual(equipamentosDe({...base,acessorios:{cabeca:'tablet',bolsa:'removido',pulso:'relogio'}}),{pulso:'relogio'});
 assert.equal(pixelDe({...base,avatarPixel:'inexistente'}).id,'leo');
 assert.equal(equiparPixel(base,'cabeca','https://example.com/item.png').acessorios.cabeca,undefined);
});
test('aparência pixel satisfaz o contrato legado de perfis e sobrevive a JSON',()=>{
 const ap=normalizarAparencia(equiparPixel(base,'cabeca','fone-gato'));
 assert.equal(ap.personagem,'atlas');assert.equal(ap.versao,'m');assert.equal(ap.look,'casual');
 assert.deepEqual(normalizarAparencia(JSON.parse(JSON.stringify(ap))),ap);
 assert.notEqual(chavePixel(ap),chavePixel(equiparPixel(ap,'cabeca','bone')));
});
test('pelo menos um pé permanece apoiado durante todo o ciclo, sem erguer os dois',()=>{
 for(let i=0;i<1000;i++){
  const pose=poseMarcha(1,i/1000*Math.PI*2,'Walk');
  assert.ok(pose.esquerdo.apoio||pose.direito.apoio);
  if(pose.esquerdo.apoio)assert.equal(pose.esquerdo.altura,0);
  if(pose.direito.apoio)assert.equal(pose.direito.altura,0);
  assert.ok(pose.esquerdo.altura>=0&&pose.direito.altura>=0);
 }
 const a=poseMarcha(1,.8*Math.PI*2,'Walk'),b=poseMarcha(1,.8*Math.PI*2+Math.PI,'Walk');
 assert.ok(a.esquerdo.altura>0);assert.ok(Math.abs(a.esquerdo.altura-b.direito.altura)<1e-10);
 for(const t of [0,.6,1])assert.ok(Math.abs(passoPe(t*Math.PI*2-1e-7).altura-passoPe(t*Math.PI*2+1e-7).altura)<1e-6);
});
test('cadência depende da distância e a parada amortece até o repouso',()=>{
 const a=new MarchaPixel(),b=new MarchaPixel();
 for(let i=0;i<60;i++)a.atualizar(1/60,'Walk',.8);
 for(let i=0;i<120;i++)b.atualizar(1/120,'Walk',.8);
 assert.ok(Math.abs(a.fase-b.fase)<1e-10);
 const antes=a.peso,pose=a.atualizar(1/60,'Idle',0);
 assert.ok(a.peso>0&&a.peso<antes);assert.ok(Number.isFinite(pose.troncoY));
 const fase=a.fase;for(let i=0;i<120;i++)a.atualizar(1/60,'Idle',0);
 assert.equal(a.peso,0);assert.equal(a.fase,fase);
 const parada=a.atualizar(.1,'Walk',1,true);
 assert.equal(parada.troncoY,0);assert.equal(parada.esquerdo.altura,0);assert.equal(parada.direito.altura,0);
});
test('deslocamento acelera, freia e chega ao destino sem ultrapassá-lo',()=>{
 let v=0,d=2,anterior=0,freou=false,acelerou=false;
 for(let i=0;i<1000&&d>0;i++){
  const p=avancarPasso(v,d,1/60,.8,true);
  assert.ok(p.distancia<=d);assert.ok(p.velocidade<=.800001);
  assert.ok(Math.abs(p.velocidade-v)<=2.4/60+1e-10);
  if(p.velocidade>anterior)acelerou=true;if(p.velocidade<anterior)freou=true;
  anterior=p.velocidade;v=p.velocidade;d-=p.distancia;
 }
 assert.equal(d,0);assert.ok(acelerou&&freou);
});
test('roupas são independentes dos acessórios e persistem após normalização e JSON',()=>{
 const ap=equiparPixel(base,'cabeca','bone');
 const roupa=mudarRoupa(ap,{modelo:'executiva',superior:'coral',inferior:'jeans',calcado:'branco'});
 assert.equal(roupa.acessorios.cabeca,'bone');assert.equal(ap.roupaPixel,undefined);
 assert.deepEqual(roupaDe(normalizarAparencia(JSON.parse(JSON.stringify(roupa)))),roupa.roupaPixel);
 assert.notEqual(chavePixel(ap),chavePixel(roupa));
 assert.deepEqual(roupaDe({...ap,roupaPixel:{modelo:'javascript:bad',superior:'invalid'}}),ROUPA_PADRAO);
 assert.deepEqual(roupaDe(base),ROUPA_PADRAO);
});
test('editor apresenta opções acessíveis e não usa controles de envio para equipar',()=>{
 const html=renderToStaticMarkup(React.createElement(AvatarEditor,{value:base,onChange(){}}));
 assert.match(html,/Personalização do avatar/);assert.match(html,/Caminhar/);assert.match(html,/Acenar/);assert.match(html,/Sem acessório/);
 assert.match(html,/Modelo da roupa/);assert.match(html,/Executiva/);assert.match(html,/Futurista/);assert.match(html,/Calça/);assert.match(html,/Calçado/);
 assert.doesNotMatch(html,/<button(?![^>]*type="button")[^>]*>/);
});
test('carregamento compartilha atlas entre pessoas e permite tentar novamente após erro',async()=>{
 let tentativas=0,falhar=true;
 const antigo=globalThis.Image;
 globalThis.Image=class{set src(url){tentativas++;const key=Object.keys(ATLAS_PIXEL).find(k=>ATLAS_PIXEL[k]===url);this.width=PIXEL_ATLAS[key].width;this.height=PIXEL_ATLAS[key].height;queueMicrotask(()=>falhar?this.onerror():this.onload());}};
 try{
  await assert.rejects(carregarRecursosPixel());falhar=false;
  const [a,b]=await Promise.all([carregarRecursosPixel(),carregarRecursosPixel()]);
  assert.equal(a.bases,b.bases);assert.equal(a.original,b.original);assert.equal(tentativas,6);
 }finally{globalThis.Image=antigo;}
});
