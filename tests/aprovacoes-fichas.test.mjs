// Garante que ninguém aprova ações no computador de outra pessoa por fora do servidor
// (migração 0009_travar_aprovacoes.sql).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const admin = '00000000-0000-4000-8000-000000000001', dono = '00000000-0000-4000-8000-000000000002', colega = '00000000-0000-4000-8000-000000000003';
const avatar = JSON.stringify({ corpo: 'monitor', personagem: 'atlas', versao: 'm', look: 'casual', cor: '#ff6175', acessorio: null });
const comando = { comando: 'echo oi' };
let sala, outraSala, agente, agenteDeFora, ficha;
async function como(id, sql, params = []) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec('set role authenticated');
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
const pedirComando = (decidido_por, estado = 'aprovada', args = comando) => db.query(
  `insert into aprovacoes(ficha_id, escritorio_id, pedido, estado, decidido_por) values ($1,$2,$3,$4,$5) returning id`,
  [ficha, sala, JSON.stringify({ chamadaId: 'c1', ferramenta: 'rodar_comando', args }), estado, decidido_por]).then(r => r.rows[0].id);
const tarefa = (user_id, aprovacao_id, args = comando, ferramenta = 'rodar_comando') => db.query(
  `insert into tarefas_locais(escritorio_id, ficha_id, user_id, ferramenta, args, aprovacao_id) values ($1,$2,$3,$4,$5,$6) returning id`,
  [sala, ficha, user_id, ferramenta, JSON.stringify(args), aprovacao_id]);

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text unique, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to authenticated, anon, service_role;
    alter default privileges in schema public grant all on tables to authenticated, anon, service_role;
    alter default privileges in schema public grant all on sequences to authenticated, anon, service_role;
    create publication supabase_realtime;`);
  for (const nome of ['0001_base.sql', '0002_realtime.sql', '0003_ponte_local.sql']) {
    await db.exec((await readFile(`supabase/migrations/${nome}`, 'utf8')).replace('create extension if not exists pgcrypto;', ''));
  }
  await db.query(`insert into auth.users(id,email,email_confirmed_at) values ($1,'uilian.sabadi@grupomedcof.com.br',now()),($2,'dono@example.com',now()),($3,'colega@example.com',now())`, [admin, dono, colega]);
  await db.query('insert into escritorios(nome,criado_por) values ($1,$2)', ['Principal', admin]);
  await db.exec(await readFile('supabase/atualizar_usuarios_salas.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/0009_travar_aprovacoes.sql', 'utf8'));
  for (const id of [admin, dono, colega]) await como(id, 'update perfis set nome=$1, aparencia=$2 where user_id=$3', ['Pessoa', avatar, id]);

  sala = (await como(dono, "insert into escritorios(nome) values('Sala do time') returning id")).rows[0].id;
  await como(dono, "select gerir_membro($1,$2,'operador')", [sala, colega]);
  agente = (await como(dono, "insert into agentes(escritorio_id,nome,provedor,modelo) values($1,'Ajudante','openai','auto') returning id", [sala])).rows[0].id;
  outraSala = (await como(colega, "insert into escritorios(nome) values('Sala do colega') returning id")).rows[0].id;
  agenteDeFora = (await como(colega, "insert into agentes(escritorio_id,nome,provedor,modelo) values($1,'De fora','openai','auto') returning id", [outraSala])).rows[0].id;
  ficha = (await como(dono, "insert into fichas(escritorio_id,titulo,pedido,agente_atual) values($1,'Tarefa','Faça algo',$2) returning id", [sala, agente])).rows[0].id;
});
after(async () => { await db.close(); });

test('colega não aprova direto no banco nem mexe na ficha de outra pessoa', async () => {
  const pendente = await pedirComando(null, 'pendente');
  await db.query("update fichas set estado='aguardando_aprovacao' where id=$1", [ficha]);
  await assert.rejects(como(colega, "update aprovacoes set estado='aprovada', decidido_por=$1 where id=$2", [colega, pendente]), /permission denied/);
  await assert.rejects(como(dono, "update aprovacoes set estado='aprovada', decidido_por=$1 where id=$2", [dono, pendente]), /permission denied/, 'nem o dono: decisão só pelo servidor');
  await assert.rejects(como(colega, "update fichas set estado='fila' where id=$1", [ficha]), /permission denied/);
  await assert.rejects(como(colega, 'update fichas set criado_por=$1 where id=$2', [colega, ficha]), /permission denied/);
  await assert.rejects(como(colega, "select retomar_ficha($1)", [ficha]), /tentar de novo/);
  assert.equal((await db.query('select estado from aprovacoes where id=$1', [pendente])).rows[0].estado, 'pendente');
});

test('ficha nasce só com campos permitidos e com agente da própria sala', async () => {
  await assert.rejects(como(colega, "insert into fichas(escritorio_id,titulo,pedido,agente_atual) values($1,'X','Y',$2)", [sala, agenteDeFora]), /agente precisa ser desta sala/);
  await assert.rejects(como(colega, "insert into fichas(escritorio_id,titulo,pedido,criado_por) values($1,'X','Y',$2)", [sala, dono]), /permission denied/);
  await assert.rejects(como(colega, "insert into fichas(escritorio_id,titulo,pedido,estado) values($1,'X','Y','entregue')", [sala]), /permission denied/);
  await assert.rejects(db.query('update fichas set criado_por=$1 where id=$2', [colega, ficha]), /não podem mudar/, 'nem o servidor troca o responsável');
});

test('comando só vai para a ponte com aprovação do dono, para exatamente aquele comando, uma vez', async () => {
  await assert.rejects(tarefa(dono, null), /aprovação de quem é dono/);
  await assert.rejects(tarefa(dono, await pedirComando(colega)), /aprovação de quem é dono/, 'aprovado por colega');
  await assert.rejects(tarefa(dono, await pedirComando(dono, 'aprovada', { comando: 'echo outro' })), /aprovação de quem é dono/, 'comando diferente do aprovado');
  await assert.rejects(tarefa(colega, await pedirComando(colega)), /computador de quem criou a ficha/);
  const certa = await pedirComando(dono);
  await tarefa(dono, certa);
  await assert.rejects(tarefa(dono, certa), /duplicate key|unique/, 'a mesma aprovação não vale duas vezes');
  await tarefa(dono, null, { caminho: 'nota.md' }, 'ler_arquivo');
});

test('a ponte só muda estado e resultado da tarefa', async () => {
  const id = (await tarefa(dono, null, { caminho: 'a.md' }, 'ler_arquivo')).rows[0].id;
  await assert.rejects(como(dono, "update tarefas_locais set args='{\"comando\":\"del *\"}' where id=$1", [id]), /permission denied/);
  await assert.rejects(como(dono, "insert into tarefas_locais(escritorio_id,ficha_id,user_id,ferramenta) values($1,$2,$3,'rodar_comando')", [sala, ficha, dono]), /permission denied/);
  assert.equal((await como(dono, "update tarefas_locais set estado='executando' where id=$1 returning id", [id])).rows.length, 1);
  assert.equal((await como(colega, "update tarefas_locais set estado='feito' where id=$1 returning id", [id])).rows.length, 0, 'colega não responde tarefa alheia');
});

test('tentar de novo e cancelar seguem as regras', async () => {
  await db.query("update fichas set estado='trabalhando' where id=$1", [ficha]);
  await assert.rejects(como(colega, 'select retomar_ficha($1)', [ficha]), /ainda está trabalhando/);
  await db.exec('alter table fichas disable trigger fichas_carimbo');
  await db.query("update fichas set atualizado_em=now()-interval '7 minutes' where id=$1", [ficha]);
  await db.exec('alter table fichas enable trigger fichas_carimbo');
  await como(colega, 'select retomar_ficha($1)', [ficha]);
  assert.equal((await db.query('select estado from fichas where id=$1', [ficha])).rows[0].estado, 'fila');
  const pendente = await pedirComando(null, 'pendente');
  await como(colega, 'select cancelar_ficha($1)', [ficha]);
  assert.equal((await db.query('select estado from fichas where id=$1', [ficha])).rows[0].estado, 'cancelada');
  assert.equal((await db.query('select estado from aprovacoes where id=$1', [pendente])).rows[0].estado, 'recusada');
  assert.equal((await db.query("select count(*)::int n from tarefas_locais where ficha_id=$1 and estado='pendente'", [ficha])).rows[0].n, 0);
  await assert.rejects(como(colega, 'select cancelar_ficha($1)', [ficha]), /já foi encerrada/);
  await assert.rejects(como(admin, 'select cancelar_ficha($1)', [ficha]), /papel não permite/, 'quem não é da sala não cancela');
});
