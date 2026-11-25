import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdir,rm,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url), THREE=require('three');
const arquivo=resolve('node_modules/.cache/ambientes-tests.cjs');
await mkdir(resolve('node_modules/.cache'),{recursive:true});
await build({stdin:{contents:`export * from './apps/desktop/src/ambientes'; export * from './apps/desktop/src/moveisModulares3d'; export * from './apps/desktop/src/caminhosAmbiente'; export * from './apps/desktop/src/mundo3d'; export * from './apps/desktop/src/pessoas3d';`,resolveDir:process.cwd()},outfile:arquivo,bundle:true,platform:'node',format:'cjs',external:['three'],loader:{'.png':'dataurl'},logLevel:'silent'});
const {ESTILOS,MOVEIS,criarAmbiente,validarAmbiente,erroPosicao,lugarLivre,moverItem,removerItem,montarMovel,descartarObjeto,CaminhosAmbiente,Mundo,Pessoas3D}=require(arquivo);
after(()=>rm(arquivo,{force:true}));
test('os dez ambientes preservam estações, posições válidas e disposições distintas',()=>{
  const assinaturas=new Set();
  assert.equal(ESTILOS.length,10);assert.equal(MOVEIS.length,48);
  for(const e of ESTILOS){const a=criarAmbiente(e.id);assert.equal(validarAmbiente(a),true,e.id);assinaturas.add(JSON.stringify(a.itens));for(const i of a.itens)assert.equal(erroPosicao(i,a.itens),null,`${e.id}/${i.id}/${i.tipo}`);}
  assert.equal(assinaturas.size,10);
});
test('catálogo cria 48 objetos 3D com geometria finita, selecionáveis e descartáveis',()=>{
  for(const d of MOVEIS){const g=montarMovel({id:'teste',tipo:d.id,x:0,z:0,giro:0},ESTILOS[0]);const b=new THREE.Box3().setFromObject(g);assert.ok(!b.isEmpty(),d.id);assert.ok([...b.min,...b.max].every(Number.isFinite),d.id);assert.equal(g.userData.movelId,'teste');let descartes=0;g.traverse(o=>o.geometry?.addEventListener('dispose',()=>descartes++));descartarObjeto(g);assert.ok(descartes>0);}
});
test('colisões, limites, dados corrompidos e acessórios sem apoio são rejeitados',()=>{
  const a=criarAmbiente();const i={id:'nova',tipo:'mesa-carvalho',x:-5.4,z:-1.5,giro:0};assert.match(erroPosicao(i,a.itens),/ocupado/);assert.match(erroPosicao({...i,x:20},a.itens),/dentro/);
  assert.match(erroPosicao({...i,tipo:'monitor',x:8,z:6},a.itens),/sobre uma mesa/);
  for(const valor of [null,{}, {...a,estilo:'javascript:foo'},{...a,itens:[...a.itens,a.itens[0]]},{...a,itens:a.itens.map((i,n)=>n?i:{...i,x:NaN})},{...a,itens:a.itens.map(i=>i.id==='posto-1'?{...i,slot:0}:i)},{...a,itens:a.itens.map(i=>i.id==='posto-0'?{...i,slot:12}:i)}])assert.equal(validarAmbiente(valor),false);
  assert.equal(validarAmbiente({...a,itens:[]}),true);
  const novo=lugarLivre('planta-grande',a.itens);assert.ok(novo);assert.equal(erroPosicao(novo,a.itens),null);
});
test('caminhos contornam móveis e não atravessam barreira fechada',()=>{
  const base={versao:1,estilo:'classico',itens:[{id:'mesa',tipo:'mesa-carvalho',x:0,z:0,giro:0}]};
  const c=new CaminhosAmbiente(base),rota=c.rota({x:-3,z:0},{x:3,z:0});assert.ok(rota.length>2);let p={x:-3,z:0};for(const q of rota){const n=Math.ceil(Math.hypot(q.x-p.x,q.z-p.z)/.1);for(let i=1;i<=n;i++){const x=p.x+(q.x-p.x)*i/n,z=p.z+(q.z-p.z)*i/n;assert.ok(!(Math.abs(x)<1.15 && Math.abs(z)<.64),'atravessou mesa');}p=q;}
  const muro=new CaminhosAmbiente({...base,itens:Array.from({length:16},(_,n)=>({id:`m-${n}`,tipo:'divisoria-madeira',x:0,z:-7.5+n,giro:1}))});assert.deepEqual(muro.rota({x:-3,z:0},{x:3,z:0}),[]);
});
test('acessórios acompanham movimento, giro e remoção da mesa de apoio',()=>{
  const a=criarAmbiente();const mesa={id:'mesa-nova',tipo:'mesa-carvalho',x:0,z:-4.5,giro:0};const acessorio={id:'notebook-novo',tipo:'notebook',x:.5,z:-4.5,giro:0};a.itens.push(mesa,acessorio);
  assert.equal(validarAmbiente(a),true);
  const resultado=moverItem(a,{...mesa,x:0,z:-4.5,giro:1});assert.ok(resultado.ambiente,resultado.erro);
  const item=resultado.ambiente.itens.find(i=>i.id===acessorio.id);assert.equal(item.x,0);assert.equal(item.z,-5);assert.equal(item.giro,1);assert.equal(validarAmbiente(resultado.ambiente),true);
  const sem=removerItem(resultado.ambiente,mesa.id);assert.ok(!sem.itens.some(i=>i.id===acessorio.id));assert.equal(sem.itens.filter(i=>i.tipo==='posto').length,12);
  const posto=a.itens.find(i=>i.id==='posto-0');const sobre={id:'notebook-posto',tipo:'notebook',x:posto.x,z:posto.z,giro:0};const comApoio={...a,itens:[...a.itens,sobre]};
  assert.equal(validarAmbiente(comApoio),true);
  const semPosto=removerItem(comApoio,'posto-0');assert.equal(semPosto.itens.filter(i=>i.tipo==='posto').length,11);assert.ok(!semPosto.itens.some(i=>i.id==='notebook-posto'));assert.equal(validarAmbiente(semPosto),true);
  assert.equal(validarAmbiente({...a,itens:[...a.itens,null]}),false);
});
test('trocar ambiente remove decoração antiga e mantém as doze estações',()=>{
  const mundo=new Mundo();try{for(const e of ESTILOS){mundo.configurar(criarAmbiente(e.id));assert.equal(mundo.scene.children.filter(o=>o.name.startsWith('estacao-')).length,12);assert.equal(mundo.scene.children.filter(o=>o.name==='ambiente').length,1);}mundo.selecionarMovel('posto-0');mundo.selecionarMovel(null);}finally{mundo.destruir();}
});
test('colisão contínua impede atravessar móveis finos, cadeiras e paredes',()=>{
  const c=new CaminhosAmbiente({versao:1,estilo:'classico',itens:[{id:'divisoria',tipo:'divisoria-vidro',x:0,z:0,giro:1},{id:'posto-0',tipo:'posto',slot:0,x:4,z:2,giro:0}]});
  const hit=c.mover({x:-4,z:0},{x:4,z:0});assert.ok(hit.x<-.4);assert.equal(c.bloqueado(hit),false);
  assert.equal(c.bloqueado({x:4,z:3.1}),true,'cadeira também é sólida');
  for(const destino of [{x:200,z:4},{x:-200,z:4},{x:-4,z:200},{x:-4,z:-200}]){const p=c.mover({x:-4,z:4},destino);assert.equal(c.bloqueado(p),false);assert.ok(p.x>=-10.15&&p.x<=10.15&&p.z>=-7.2&&p.z<=7.65);}
  const dentro=c.livre({x:0,z:0});assert.equal(c.bloqueado(dentro),false);
});
test('rotas em todas as disposições mantêm corpo livre ao longo de cada segmento',()=>{
  for(const e of ESTILOS){const a=criarAmbiente(e.id),c=new CaminhosAmbiente(a),inicio=c.livre({x:8,z:7});
    for(const i of a.itens.filter(i=>i.tipo==='posto')){
      const ang=i.giro*Math.PI/2,alvo=c.livre({x:i.x+Math.cos(ang)*.95+Math.sin(ang)*1.1,z:i.z-Math.sin(ang)*.95+Math.cos(ang)*1.1});
      const rota=c.rota(inicio,alvo);assert.ok(rota.length,`${e.id}/${i.id}: estação inacessível`);
      let pos=inicio;for(const q of rota){assert.equal(c.segmentoLivre(pos,q),true,`${e.id}/${i.id}: segmento cruza obstáculo`);pos=q;}
      assert.ok(Math.hypot(pos.x-alvo.x,pos.z-alvo.z)<.001);
    }
  }
});
test('agentes e pessoas bloqueiam passos inválidos e nascem fora dos móveis',()=>{
  const carregar=THREE.TextureLoader.prototype.load;THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
  const m=new Mundo(),a=criarAmbiente(),c=new CaminhosAmbiente(a);
  const pessoas=new Pessoas3D(m.scene,(de,para)=>m.caminho(de,para),p=>m.posicaoLivre(p),(de,para)=>m.limitarPasso(de,para));
  const modelo=()=>({root:new THREE.Group(),passo(){},destruir(){},opacidade(){}});
  const aparencia={corpo:'monitor',cor:'#ff0000',acessorio:null};
  try {
    m.configurar(a);m.sync([{id:'teste',nome:'Teste',aparencia,ativo:true}],new Set(),null);
    const b=m.bonecos.get('teste');assert.equal(c.bloqueado(b.grupo.position),false);b.animado=modelo();b.ocupado=true;b.grupo.position.set(-8,0,-1.5);b.rota=[{x:0,z:-1.5}];
    for(let n=0;n<300;n++){m.passo(.05);assert.equal(c.bloqueado(b.grupo.position),false);}assert.ok(b.grupo.position.x<-6.6);
    pessoas.sync([{user_id:'pessoa',nome:'Pessoa',aparencia,x:-5.4,z:-1.5}]);const p=pessoas.pessoas.get('pessoa');assert.equal(c.bloqueado(p.grupo.position),false);
    p.modelo=modelo();p.grupo.position.set(-8,0,-1.5);p.rota=[new THREE.Vector3(0,0,-1.5)];
    for(let n=0;n<200;n++){pessoas.passo(.05,false);assert.equal(c.bloqueado(p.grupo.position),false);}assert.ok(p.grupo.position.x<-6.6);
    pessoas.passo(.05,true);assert.equal(c.bloqueado(p.grupo.position),false,'modo sem animação também resolve o destino');
  }finally{pessoas.destruir();m.destruir();THREE.TextureLoader.prototype.load=carregar;}
});
test('banco exige acesso, valida layout e impede sobrescrita concorrente',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select current_setting('request.jwt.claim.sub')::uuid$$;create table public.escritorios(id uuid primary key);create table membros(escritorio_id uuid,user_id uuid,papel text);create function public.tenho_papel(sala uuid,minimo text) returns boolean language sql security definer as $$select exists(select 1 from membros where escritorio_id=sala and user_id=auth.uid() and (minimo='leitor' or papel in ('editor','dono')))$$;grant usage on schema public,auth to authenticated;create publication supabase_realtime;`);
    await db.exec(await readFile('supabase/migrations/0012_ambientes_escritorio.sql','utf8'));
    await db.exec(await readFile('supabase/migrations/0013_ambientes_estacoes_opcionais.sql','utf8'));
    const sala='00000000-0000-4000-8000-000000000001',dono='00000000-0000-4000-8000-000000000002',leitor='00000000-0000-4000-8000-000000000003',estranho='00000000-0000-4000-8000-000000000004';
    await db.query('insert into auth.users values($1),($2),($3)',[dono,leitor,estranho]);await db.query('insert into escritorios values($1)',[sala]);await db.query("insert into membros values($1,$2,'dono'),($1,$3,'leitor')",[sala,dono,leitor]);
    async function como(id,sql,args=[]){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');try{return await db.query(sql,args);}finally{await db.exec('reset role');}}
    const salvar=(id,a,rev)=>como(id,'select salvar_ambiente($1,$2,$3) as revisao',[sala,a,rev]);
    for(const id of [leitor,estranho])await assert.rejects(salvar(id,criarAmbiente(),0),/decorar/);
    assert.equal((await salvar(dono,criarAmbiente(),0)).rows[0].revisao,1);
    assert.equal((await como(leitor,'select * from ambientes_escritorio')).rows.length,1);assert.equal((await como(estranho,'select * from ambientes_escritorio')).rows.length,0);
    await assert.rejects(salvar(dono,criarAmbiente('tech'),0),/alterada/);
    await assert.rejects(salvar(dono,{...criarAmbiente(),itens:criarAmbiente().itens.map((i,n)=>n?i:{...i,x:999})},1),/Posição/);
    await assert.rejects(salvar(dono,{...criarAmbiente(),itens:criarAmbiente().itens.map(i=>i.id==='posto-1'?{...i,slot:0}:i)},1),/Estação/);
    const semUma=removerItem(criarAmbiente(),'posto-0');
    assert.equal((await salvar(dono,semUma,1)).rows[0].revisao,2);
    assert.equal((await salvar(dono,{...criarAmbiente(),itens:[]},2)).rows[0].revisao,3);
    await assert.rejects(como(dono,"update ambientes_escritorio set revisao=9"),/permission denied/);
  }finally{await db.close();}
});
