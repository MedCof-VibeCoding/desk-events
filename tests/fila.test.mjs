// Fila em segundo plano (migração 0010) e o ciclo do agente com prazo e espera pelo computador.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';

// ---------- banco ----------
const db = new PGlite();
const admin = '00000000-0000-4000-8000-000000000001', dono = '00000000-0000-4000-8000-000000000002', colega = '00000000-0000-4000-8000-000000000003';
const avatar = JSON.stringify({ corpo: 'monitor', personagem: 'atlas', versao: 'm', look: 'casual', cor: '#ff6175', acessorio: null });
let sala, agente;
async function como(id, sql, params = []) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec('set role authenticated');
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
const novaFicha = async (titulo = 'Tarefa') => (await como(dono, "insert into fichas(escritorio_id,titulo,pedido,agente_atual) values($1,$2,'Faça',$3) returning id", [sala, titulo, agente])).rows[0].id;
const estado = async id => (await db.query('select estado from fichas where id=$1', [id])).rows[0].estado;
const pegar = async (limite, so = null) => (await db.query('select id from pegar_fichas($1,$2)', [limite, so])).rows.map(r => r.id);
const envelhecer = async (id, campo, intervalo) => {
  await db.exec('alter table fichas disable trigger fichas_carimbo');
  await db.query(`update fichas set ${campo} = now() - interval '${intervalo}' where id=$1`, [id]);
  await db.exec('alter table fichas enable trigger fichas_carimbo');
};

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
  await db.query(`insert into auth.users(id,email,email_confirmed_at) values ($1,'uilian.sabadi@grupomedcof.com.br',now()),($2,'dono@example.com',now()),($3,'colega@example.com',now())`, [admin, dono, colega]);
  await db.query('insert into escritorios(nome,criado_por) values ($1,$2)', ['Principal', admin]);
  await db.exec(await readFile('supabase/atualizar_usuarios_salas.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/0009_travar_aprovacoes.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/0010_fila_em_segundo_plano.sql', 'utf8'));
  for (const id of [admin, dono, colega]) await como(id, 'update perfis set nome=$1, aparencia=$2 where user_id=$3', ['Pessoa', avatar, id]);
  sala = (await como(dono, "insert into escritorios(nome) values('Sala') returning id")).rows[0].id;
  await como(dono, "select gerir_membro($1,$2,'operador')", [sala, colega]);
  agente = (await como(dono, "insert into agentes(escritorio_id,nome,provedor,modelo) values($1,'Ajudante','openai','auto') returning id", [sala])).rows[0].id;
});

test('cada ficha é pega por uma execução só, e a reserva vencida libera de novo', async () => {
  const a = await novaFicha('A'), b = await novaFicha('B');
  assert.deepEqual(await pegar(1, a), [a]);
  assert.equal(await estado(a), 'trabalhando');
  assert.deepEqual(await pegar(5, a), [], 'reservada: ninguém pega de novo');
  assert.deepEqual(await pegar(5), [b], 'o despertador pega o que sobrou na fila');
  await db.query("update fichas set trabalhando_ate = now() - interval '1 second' where id=$1", [a]);
  assert.deepEqual(await pegar(5), [a], 'servidor caiu: a reserva venceu e a ficha volta a andar');
  await db.query("update fichas set estado='entregue' where id = any($1)", [[a, b]]);
});

test('sala pausada não anda; ficha em laço para com erro', async () => {
  const a = await novaFicha();
  await db.query('update escritorios set pausado=true where id=$1', [sala]);
  assert.deepEqual(await pegar(5), []);
  await db.query('update escritorios set pausado=false where id=$1', [sala]);
  await db.query('update fichas set voltas=50 where id=$1', [a]);
  assert.deepEqual(await pegar(5), []);
  assert.equal(await estado(a), 'erro');
});

test('ficha volta para a fila quando a ponte responde o último pedido', async () => {
  const f = await novaFicha();
  await db.query("update fichas set estado='aguardando_computador' where id=$1", [f]);
  const ids = [];
  for (const c of ['c1', 'c2']) ids.push((await db.query("insert into tarefas_locais(escritorio_id,ficha_id,user_id,ferramenta,args,chamada_id) values($1,$2,$3,'ler_arquivo','{}',$4) returning id", [sala, f, dono, c])).rows[0].id);
  await como(dono, "update tarefas_locais set estado='feito', resultado='ok' where id=$1", [ids[0]]);
  assert.equal(await estado(f), 'aguardando_computador', 'ainda falta um pedido');
  await como(dono, "update tarefas_locais set estado='erro', resultado='não deu' where id=$1", [ids[1]]);
  assert.equal(await estado(f), 'fila', 'acorda sem Vault configurado também (o despertador só não dispara)');
  await db.query("update fichas set estado='entregue' where id=$1", [f]);
});

test('cancelar e tentar de novo respeitam a reserva', async () => {
  const f = await novaFicha();
  await db.query("update fichas set estado='aguardando_computador' where id=$1", [f]);
  await como(colega, 'select cancelar_ficha($1)', [f]);
  assert.equal(await estado(f), 'cancelada');
  const g = await novaFicha();
  await pegar(1, g);
  await assert.rejects(como(colega, 'select retomar_ficha($1)', [g]), /ainda está trabalhando/);
  await db.query("update fichas set trabalhando_ate = now() - interval '1 minute', voltas = 9 where id=$1", [g]);
  await como(colega, 'select retomar_ficha($1)', [g]);
  const r = (await db.query('select estado, voltas from fichas where id=$1', [g])).rows[0];
  assert.deepEqual(r, { estado: 'fila', voltas: 0 });
  // Ficha antiga, de antes da reserva existir: conta pela última atualização.
  await db.query("update fichas set estado='trabalhando', trabalhando_ate=null where id=$1", [g]);
  await envelhecer(g, 'atualizado_em', '7 minutes');
  assert.deepEqual(await pegar(1, g), [g]);
});

test('só o servidor pega fichas e acorda a fila', async () => {
  await assert.rejects(como(dono, 'select * from pegar_fichas(5, null)'), /permission denied/);
  await assert.rejects(como(dono, 'select acordar_fila()'), /permission denied/);
});

// ---------- ciclo do agente ----------
const arquivo = resolve('node_modules/.cache/fila-tests.cjs');
await mkdir(resolve('node_modules/.cache'), { recursive: true });
await build({ stdin: { contents: "export * from './apps/server/lib/loop';", resolveDir: process.cwd(), loader: 'ts' }, outfile: arquivo, bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent' });
const { trabalhar } = createRequire(import.meta.url)(arquivo);
after(async () => { await db.close(); await rm(arquivo, { force: true }).catch(() => {}); });

function memoria(falas, local = async () => 'ok') {
  const m = { passos: [], ficha: { id: 'f1', escritorio_id: 'e1', pedido: 'Faça', estado: 'trabalhando', agente_atual: 'a1', criado_por: 'u1' }, chamadasModelo: 0, locais: [] };
  const agente = { id: 'a1', nome: 'Ana', cargo: '', instrucoes: '', provedor: 'openai', modelo: 'auto', autonomia: 'autonomo', max_passos: 20, ativo: true };
  const store = {
    ficha: async () => ({ ...m.ficha }), agente: async () => agente, colegas: async () => [agente], pausado: async () => false,
    passos: async () => m.passos.map(p => ({ ...p })),
    addPasso: async (_f, agente_id, tipo, conteudo) => { m.passos.push({ tipo, agente_id, conteudo: JSON.parse(JSON.stringify(conteudo)) }); },
    setFicha: async (_id, patch) => { Object.assign(m.ficha, patch); },
    aprovacoes: async () => [], addAprovacao: async () => {},
    local: async (_f, ferramenta, args, aprovacaoId, chamadaId) => { m.locais.push(chamadaId); return local(chamadaId); }
  };
  const conversar = async () => { const r = falas[m.chamadasModelo++] ?? { texto: 'Pronto.', chamadas: [] }; return { bruto: null, tokensEntrada: 0, tokensSaida: 0, ...r }; };
  return { m, store, deps: { conversar, buscar: async () => 'pagina' } };
}
const ler = id => ({ texto: '', chamadas: [{ id, nome: 'ler_arquivo', args: { caminho: 'a.md' } }] });

test('prazo vencido: devolve para a fila num ponto seguro e a próxima execução continua', async () => {
  const { m, store, deps } = memoria([{ texto: '', chamadas: [{ id: 'b1', nome: 'buscar_url', args: { url: 'https://x.com' } }] }, { texto: 'Resumo final.', chamadas: [] }]);
  assert.deepEqual(await trabalhar(store, 'f1', { ...deps, prazo: Date.now() - 1 }), { estado: 'fila' });
  assert.equal(m.chamadasModelo, 1, 'fez ao menos um passo antes de parar');
  assert.equal(m.ficha.estado, 'fila');
  m.ficha.estado = 'trabalhando';
  assert.deepEqual(await trabalhar(store, 'f1', deps), { estado: 'entregue' });
  assert.equal(m.ficha.resultado, 'Resumo final.');
  assert.equal(m.passos.filter(p => p.conteudo?.msg?.role === 'tool').length, 1, 'a busca não foi repetida');
});

test('ponte sem resposta: a ficha espera o computador e retoma com a resposta, sem reenviar', async () => {
  let respondeu = false;
  const { m, store, deps } = memoria([ler('l1'), { texto: 'Li o arquivo.', chamadas: [] }], async () => respondeu ? 'conteúdo do arquivo' : null);
  assert.deepEqual(await trabalhar(store, 'f1', deps), { estado: 'aguardando_computador' });
  assert.equal(m.ficha.estado, 'aguardando_computador');
  respondeu = true; m.ficha.estado = 'trabalhando';
  assert.deepEqual(await trabalhar(store, 'f1', deps), { estado: 'entregue' });
  assert.deepEqual(m.locais, ['l1', 'l1'], 'a retomada procura a mesma chamada');
  assert.equal(m.chamadasModelo, 2, 'o modelo não foi chamado de novo para a mesma ação');
});
