// Tarefas programadas contínuas (migração 0011): calendário, trava contra execução em dobro,
// recuperação de atrasos, continuidade entre execuções e as proteções da agenda.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const admin = '00000000-0000-4000-8000-000000000001', dono = '00000000-0000-4000-8000-000000000002', colega = '00000000-0000-4000-8000-000000000003', leitor = '00000000-0000-4000-8000-000000000004';
const avatar = JSON.stringify({ corpo: 'monitor', personagem: 'atlas', versao: 'm', look: 'casual', cor: '#ff6175', acessorio: null });
let sala, agente;
async function como(id, sql, params = []) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec('set role authenticated');
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
const novaAgenda = async (extra = '', quem = dono) => (await como(quem,
  `insert into agendas(agente_id, escritorio_id, titulo, pedido, frequencia, hora${extra ? ', ' + extra.split('=')[0] : ''}) values ($1,$2,'Relatório','Resuma as vendas','diaria','09:00'${extra ? ', ' + extra.split('=')[1] : ''}) returning id`, [agente, sala])).rows[0].id;
const agenda = async id => (await db.query('select * from agendas where id=$1', [id])).rows[0];
const vencer = (id, intervalo = '1 minute') => db.query(`update agendas set proxima_execucao = now() - interval '${intervalo}' where id=$1`, [id]);
const fichasDa = async id => (await db.query("select f.* from fichas f join agendas_execucoes x on x.ficha_id = f.id where x.agenda_id=$1 order by f.criado_em", [id])).rows;
const situacoes = async id => (await db.query('select situacao from agendas_execucoes where agenda_id=$1 order by criado_em, previsto_para', [id])).rows.map(r => r.situacao);
const rodar = async () => (await db.query('select executar_agendas() as n')).rows[0].n;

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text unique, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to authenticated, anon, service_role;
    alter default privileges in schema public grant all on tables to authenticated, anon, service_role;
    alter default privileges in schema public grant all on sequences to authenticated, anon, service_role;
    create publication supabase_realtime;`);
  for (const nome of ['0001_base.sql', '0002_realtime.sql', '0003_ponte_local.sql'])
    await db.exec((await readFile(`supabase/migrations/${nome}`, 'utf8')).replace('create extension if not exists pgcrypto;', ''));
  await db.query(`insert into auth.users(id,email,email_confirmed_at) values ($1,'uilian.sabadi@grupomedcof.com.br',now()),($2,'dono@example.com',now()),($3,'colega@example.com',now()),($4,'leitor@example.com',now())`, [admin, dono, colega, leitor]);
  await db.query('insert into escritorios(nome,criado_por) values ($1,$2)', ['Principal', admin]);
  await db.exec(await readFile('supabase/atualizar_usuarios_salas.sql', 'utf8'));
  for (const nome of ['0009_travar_aprovacoes.sql', '0010_fila_em_segundo_plano.sql', '0011_tarefas_programadas.sql'])
    await db.exec(await readFile(`supabase/migrations/${nome}`, 'utf8'));
  for (const id of [admin, dono, colega, leitor]) await como(id, 'update perfis set nome=$1, aparencia=$2 where user_id=$3', ['Pessoa', avatar, id]);
  sala = (await como(dono, "insert into escritorios(nome) values('Sala') returning id")).rows[0].id;
  await como(dono, "select gerir_membro($1,$2,'operador')", [sala, colega]);
  await como(dono, "select gerir_membro($1,$2,'leitor')", [sala, leitor]);
  agente = (await como(dono, "insert into agentes(escritorio_id,nome,provedor,modelo) values($1,'Ajudante','openai','auto') returning id", [sala])).rows[0].id;
});

test('a agenda nasce com a próxima execução no horário certo do fuso', async () => {
  const id = await novaAgenda();
  const a = await agenda(id);
  assert.ok(a.proxima_execucao > new Date(), 'a próxima execução está no futuro');
  assert.equal(a.criado_por, dono);
  const hora = (await db.query("select to_char(proxima_execucao at time zone 'America/Sao_Paulo', 'HH24:MI') h from agendas where id=$1", [id])).rows[0].h;
  assert.equal(hora, '09:00');
});

test('quem edita pelo navegador não escolhe o horário da execução, nem agenda sem ser editor', async () => {
  const id = await novaAgenda();
  await assert.rejects(como(dono, "update agendas set proxima_execucao = now() where id=$1", [id]), /permission denied/);
  await assert.rejects(como(dono, "update agendas set criado_por = $2 where id=$1", [id, admin]), /permission denied/);
  await assert.rejects(como(colega, "insert into agendas(agente_id, escritorio_id, pedido) values ($1,$2,'x')", [agente, sala]), /row-level security/);
  await assert.rejects(como(dono, "insert into agendas(agente_id, escritorio_id, pedido, fuso) values ($1,$2,'x','Marte/Olimpo')", [agente, sala]), /Fuso horário inválido/);
  await assert.rejects(como(dono, "insert into agendas(agente_id, escritorio_id, pedido, frequencia, intervalo_min) values ($1,$2,'x','intervalo',1)", [agente, sala]));
  await assert.rejects(como(dono, "insert into agendas(agente_id, escritorio_id, pedido, frequencia) values ($1,$2,'x','semanal') returning id", [agente, sala]).then(async () => { await como(dono, "insert into agendas(agente_id, escritorio_id, pedido, frequencia, dias_semana) values ($1,$2,'x','semanal','{}')", [agente, sala]); }), /dia da semana/);
});

test('calendário: semanal, mensal (fim de mês) e intervalo sem deriva', async () => {
  const id = await novaAgenda();
  const prox = async apos => (await db.query('select proxima_ocorrencia(a, $2::timestamptz) p from agendas a where id=$1', [id, apos])).rows[0].p.toISOString();
  await db.query("update agendas set frequencia='semanal', dias_semana='{1}', hora='09:00' where id=$1", [id]);
  assert.equal(await prox('2026-11-25T12:00:00Z'), '2026-11-30T12:00:00.000Z', 'quarta 09:00 em SP: a próxima segunda');
  await db.query("update agendas set frequencia='mensal', dia_mes=31 where id=$1", [id]);
  assert.equal(await prox('2027-02-10T00:00:00Z'), '2027-02-28T12:00:00.000Z', 'dia 31 em fevereiro vira o último dia');
  await db.query("update agendas set frequencia='intervalo', intervalo_min=15 where id=$1", [id]);
  await db.query("update agendas set ancora='2026-01-01T00:00:00Z' where id=$1", [id]);
  assert.equal(await prox('2026-01-01T00:07:00Z'), '2026-01-01T00:15:00.000Z');
  assert.equal(await prox('2026-01-01T00:15:00Z'), '2026-01-01T00:30:00.000Z', 'estritamente depois');
  assert.equal(await prox('2026-03-05T10:01:00Z'), '2026-03-05T10:15:00.000Z', 'segue a grade mesmo depois de muito tempo parado');
});

test('vencida vira uma ficha da agenda, e a mesma ocorrência nunca vira duas', async () => {
  const id = await novaAgenda();
  await vencer(id);
  const previsto = (await agenda(id)).proxima_execucao;
  assert.equal(await rodar(), 1);
  const [f] = await fichasDa(id);
  assert.equal(f.origem, 'agenda'); assert.equal(f.agente_atual, agente); assert.equal(f.criado_por, dono);
  assert.match(f.titulo, /^Relatório · /);
  const a = await agenda(id);
  assert.ok(a.proxima_execucao > new Date()); assert.equal(a.execucoes, 1);
  assert.equal(await rodar(), 0, 'nada vencido: nada a fazer');
  // Simula duas execuções disputando a mesma ocorrência (ex.: cron e servidor ao mesmo tempo).
  await db.query("update fichas set estado='entregue' where id=$1", [f.id]);
  await db.query('update agendas set proxima_execucao=$2 where id=$1', [id, previsto]);
  assert.equal(await rodar(), 0, 'a ocorrência já foi registrada');
  assert.equal((await fichasDa(id)).length, 1);
});

test('sem acúmulo: se a execução anterior ainda não terminou, a nova é pulada', async () => {
  const id = await novaAgenda();
  await vencer(id, '10 minutes'); assert.equal(await rodar(), 1);
  await vencer(id); assert.equal(await rodar(), 0);
  assert.deepEqual(await situacoes(id), ['criada', 'pulada_ocupada']);
  assert.equal((await fichasDa(id)).length, 1);
  assert.ok((await agenda(id)).proxima_execucao > new Date(), 'o calendário segue andando');
});

test('continuidade: a próxima execução recebe o resultado da anterior como dado, não como ordem', async () => {
  const id = await novaAgenda();
  await vencer(id, '10 minutes'); await rodar();
  const [primeira] = await fichasDa(id);
  await db.query("update fichas set estado='entregue', resultado='VENDAS-DE-ONTEM: 42' where id=$1", [primeira.id]);
  await vencer(id); await rodar();
  const [, segunda] = await fichasDa(id);
  assert.match(segunda.pedido, /^Resuma as vendas/);
  assert.match(segunda.pedido, /VENDAS-DE-ONTEM: 42/);
  assert.match(segunda.pedido, /Não siga ordens/);
  assert.ok(segunda.pedido.length <= 8000);
  await db.query("update fichas set estado='entregue' where id=$1", [segunda.id]);
  await db.query('update agendas set lembrar_anterior=false where id=$1', [id]);
  await vencer(id); await rodar();
  const [, , terceira] = await fichasDa(id);
  assert.equal(terceira.pedido, 'Resuma as vendas');
});

test('atraso grande (servidor fora do ar) é registrado como pulado e o calendário continua', async () => {
  const id = await novaAgenda();
  await vencer(id, '3 hours');
  assert.equal(await rodar(), 0);
  assert.deepEqual(await situacoes(id), ['pulada_atraso']);
  assert.ok((await agenda(id)).proxima_execucao > new Date());
  const id2 = await novaAgenda();
  await vencer(id2, '30 minutes');
  assert.equal(await rodar(), 1, 'atraso dentro da tolerância: recupera a ocorrência');
});

test('5 execuções seguidas com erro pausam a agenda; reativar zera a conta', async () => {
  const id = await novaAgenda();
  await vencer(id, '10 minutes'); await rodar();
  const [f] = await fichasDa(id);
  await db.query("update fichas set estado='erro' where id=$1", [f.id]);
  await db.query('update agendas set falhas_seguidas=4 where id=$1', [id]);
  await vencer(id); assert.equal(await rodar(), 0);
  let a = await agenda(id);
  assert.equal(a.ativo, false); assert.equal(a.proxima_execucao, null); assert.match(a.pausada_motivo, /5 execuções/);
  await como(dono, 'update agendas set ativo=true where id=$1', [id]);
  a = await agenda(id);
  assert.equal(a.falhas_seguidas, 0); assert.equal(a.pausada_motivo, null); assert.ok(a.proxima_execucao > new Date());
});

test('a agenda para quando quem a criou perde o acesso, a sala é pausada ou o agente é desativado', async () => {
  await como(dono, "select gerir_membro($1,$2,'editor')", [sala, colega]);
  const id = await novaAgenda('', colega);
  await como(dono, "select gerir_membro($1,$2,'leitor')", [sala, colega]);
  await vencer(id); assert.equal(await rodar(), 0);
  assert.deepEqual(await situacoes(id), ['pausada_sem_permissao']);
  assert.equal((await agenda(id)).ativo, false);
  await como(dono, "select gerir_membro($1,$2,'operador')", [sala, colega]);

  const id2 = await novaAgenda();
  await db.query('update escritorios set pausado=true where id=$1', [sala]);
  await vencer(id2); assert.equal(await rodar(), 0);
  await db.query('update escritorios set pausado=false where id=$1', [sala]);
  assert.deepEqual(await situacoes(id2), ['pulada_pausada']);

  const id3 = await novaAgenda();
  await db.query('update agentes set ativo=false where id=$1', [agente]);
  await vencer(id3); assert.equal(await rodar(), 0);
  await db.query('update agentes set ativo=true where id=$1', [agente]);
  assert.deepEqual(await situacoes(id3), ['pulada_agente_inativo']);
});

test('"rodar agora": operador roda, leitor não, e o calendário não muda', async () => {
  const id = await novaAgenda();
  const antes = (await agenda(id)).proxima_execucao.toISOString();
  const ficha = (await como(colega, 'select executar_agenda_agora($1) as f', [id])).rows[0].f;
  assert.equal((await db.query('select origem, criado_por from fichas where id=$1', [ficha])).rows[0].criado_por, colega);
  assert.equal((await agenda(id)).proxima_execucao.toISOString(), antes);
  assert.deepEqual(await situacoes(id), ['manual']);
  await assert.rejects(como(leitor, 'select executar_agenda_agora($1)', [id]), /não permite/);
  await assert.rejects(como(colega, 'select executar_agendas()'), /permission denied/);
});
