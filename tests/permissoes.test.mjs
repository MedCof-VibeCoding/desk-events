import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const admin = '00000000-0000-4000-8000-000000000001', comum = '00000000-0000-4000-8000-000000000002', outro = '00000000-0000-4000-8000-000000000003', novo = '00000000-0000-4000-8000-000000000004';
const avatar = JSON.stringify({ corpo: 'monitor', personagem: 'atlas', versao: 'm', look: 'casual', cor: '#ff6175', acessorio: null });
let principal, privada;
async function como(id, sql, params = []) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec('set role authenticated');
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text unique, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to authenticated, anon, service_role;
    alter default privileges in schema public grant all on tables to authenticated, anon, service_role;
    alter default privileges in schema public grant all on sequences to authenticated, anon, service_role;
    create publication supabase_realtime;`);
  for (const nome of ['0001_base.sql','0002_realtime.sql','0003_ponte_local.sql']) {
    const sql = (await readFile(`supabase/migrations/${nome}`, 'utf8')).replace('create extension if not exists pgcrypto;', '');
    await db.exec(sql);
  }
  await db.query(`insert into auth.users(id,email,email_confirmed_at) values ($1,'uilian.sabadi@grupomedcof.com.br',now()),($2,'comum@example.com',now()),($3,'outro@example.com',now()),($4,'novo@example.com',now())`, [admin, comum, outro, novo]);
  await db.query('insert into escritorios(nome,criado_por) values ($1,$2)', ['Sala existente do admin', admin]);
  await db.exec(await readFile('supabase/atualizar_usuarios_salas.sql', 'utf8'));
  for (const id of [admin, comum, outro]) await como(id, 'update perfis set nome=$1, aparencia=$2 where user_id=$3', [id === admin ? 'Uiu' : 'Pessoa', avatar, id]);
  principal = (await db.query('select id from escritorios where principal')).rows[0].id;
});
after(async () => { await db.close(); });

test('só o e-mail confirmado designado é admin e o escritório existente é preservado', async () => {
  const perfis = (await db.query('select user_id,admin_geral from perfis')).rows;
  assert.deepEqual(perfis.filter(p => p.admin_geral).map(p => p.user_id), [admin]);
  assert.equal((await db.query('select count(*)::int as n from escritorios where principal')).rows[0].n, 1);
  assert.equal((await db.query('select nome from escritorios where id=$1', [principal])).rows[0].nome, 'Sala existente do admin');
  await assert.rejects(como(comum, 'update perfis set admin_geral=true where user_id=$1', [comum]), /permission denied/);
  await assert.rejects(como(comum, "insert into perfis(user_id,nome,admin_geral) values($1,'Falso',true)", [novo]), /permission denied/);
});
test('avatar obrigatório também é aplicado no banco', async () => {
  await assert.rejects(como(novo, "insert into escritorios(nome) values('Sem avatar')"), /row-level security/);
  await assert.rejects(como(novo, "select marcar_presenca($1,'geral',gen_random_uuid())", [principal]), /Sem acesso/);
  await assert.rejects(como(comum, 'update perfis set aparencia=$1 where user_id=$2', [JSON.stringify({ personagem: 'inventado' }), comum]), /check constraint/);
  await assert.rejects(como(comum, 'update perfis set aparencia=$1 where user_id=$2', [JSON.stringify({ personagem: null, versao: null, look: null, cor: null }), comum]), /check constraint/);
  const result = await como(comum, "update perfis set nome='Impostor' where user_id=$1 returning user_id", [admin]); assert.equal(result.rows.length, 0);
});
test('usuário comum visita o principal mas não insere nem opera agentes ali', async () => {
  assert.equal((await como(comum, 'select meu_papel($1) as papel', [principal])).rows[0].papel, 'leitor');
  await assert.rejects(como(comum, "insert into agentes(escritorio_id,nome,provedor,modelo) values($1,'Intruso','openai','auto')", [principal]), /row-level security/);
  await assert.rejects(como(comum, "insert into fichas(escritorio_id,titulo,pedido) values($1,'Teste','Pedido')", [principal]), /row-level security/);
  await assert.rejects(como(comum, "insert into membros(escritorio_id,user_id,papel) values($1,$2,'dono')", [principal, comum]), /permission denied/);
});
test('sala pessoal é privada, usuário é dono, admin não tem bypass', async () => {
  privada = (await como(comum, "insert into escritorios(nome) values('Minha sala') returning id")).rows[0].id;
  assert.equal((await como(comum, 'select meu_papel($1) as papel', [privada])).rows[0].papel, 'dono');
  await como(comum, "insert into agentes(escritorio_id,nome,provedor,modelo) values($1,'Meu agente','openai','auto')", [privada]);
  assert.equal((await como(admin, 'select id from agentes where escritorio_id=$1', [privada])).rows.length, 0);
  await assert.rejects(como(admin, "insert into agentes(escritorio_id,nome,provedor,modelo) values($1,'Admin intruso','openai','auto')", [privada]), /row-level security/);
  await assert.rejects(como(admin, "select gerir_membro($1,$2,'dono')", [privada, admin]), /gerenciar o acesso/);
  await assert.rejects(como(comum, 'update escritorios set principal=true where id=$1', [privada]), /permission denied/);
  await assert.rejects(como(comum, 'update escritorios set criado_por=$1 where id=$2', [admin, privada]), /permission denied/);
});
test('admin adiciona agentes somente depois de receber acesso editor à sala', async () => {
  await como(comum, "select gerir_membro($1,$2,'editor')", [privada, admin]);
  await como(admin, "insert into agentes(escritorio_id,nome,provedor,modelo) values($1,'Admin autorizado','openai','auto')", [privada]);
  await como(comum, 'select gerir_membro($1,$2,null)', [privada, admin]);
  assert.equal((await como(admin, 'select id from agentes where escritorio_id=$1', [privada])).rows.length, 0);
  await assert.rejects(como(comum, 'select gerir_membro($1,$2,null)', [privada, comum]), /proprietário/);
});
test('presenças são autenticadas, restritas à sala e não podem ser falsificadas', async () => {
  await como(comum, "select marcar_presenca($1,'cafe',$2)", [principal, comum]);
  await como(outro, "select marcar_presenca($1,'cafe',$2)", [principal, outro]);
  assert.equal((await como(admin, 'select user_id from presencas where escritorio_id=$1', [principal])).rows.length, 2);
  await assert.rejects(como(outro, "select marcar_presenca($1,'cafe',$2)", [privada, outro]), /Sem acesso/);
  await assert.rejects(como(outro, 'update presencas set user_id=$1 where user_id=$2', [admin, outro]), /permission denied/);
  await como(comum, 'select sair_sala($1)', [outro]);
  assert.equal((await como(comum, 'select user_id from presencas where user_id=$1', [comum])).rows.length, 1, 'outra aba não remove a sessão atual');
});
test('mensagens privadas e seus balões não vazam para terceiros', async () => {
  await como(comum, "select falar_cafe($1,'Olá, só para você',$2)", [principal, outro]);
  assert.equal((await como(outro, 'select texto from mensagens_cafe')).rows.length, 1);
  assert.equal((await como(admin, 'select texto from mensagens_cafe')).rows.length, 0);
  await assert.rejects(como(admin, "select falar_cafe($1,'Ainda não entrei',null)", [principal]), /Entre no café/);
  await como(outro, "select falar_cafe($1,'Olá a todos',null)", [principal]);
  assert.equal((await como(admin, 'select texto from mensagens_cafe')).rows.length, 1);
  await assert.rejects(como(outro, "select falar_cafe($1,'Spam',null)", [principal]), /Aguarde/);
  await db.query("update presencas set visto_em=now()-interval '2 minutes' where user_id=$1", [comum]);
  await assert.rejects(como(comum, "select falar_cafe($1,'Offline',null)", [principal]), /Entre no café/);
});
test('tokens Google são inacessíveis e reuniões Google não podem ser forjadas pelo cliente', async () => {
  await assert.rejects(como(admin, 'select * from google_conexoes'), /permission denied/);
  await assert.rejects(como(comum, 'select * from google_oauth_estados'), /permission denied/);
  await assert.rejects(como(comum, "insert into reunioes(escritorio_id,criado_por,titulo,inicio,fim,link,google_event_id) values($1,$2,'Falsa',now(),now()+interval '1 hour','https://meet.google.com/test','fake')", [principal, comum]), /permission denied/);
});
