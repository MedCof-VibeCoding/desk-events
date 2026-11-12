import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const file = resolve('node_modules/.cache/social-tests.cjs');
await mkdir(resolve('node_modules/.cache'), { recursive: true });
await build({ stdin: { contents: `export * from './apps/server/lib/google-agenda'; export * from './apps/desktop/src/social'; export * from './apps/desktop/src/Cafe';`, resolveDir: process.cwd(), loader: 'tsx' }, outfile: file, bundle: true, platform: 'node', format: 'cjs', external: ['react','react-dom','@supabase/supabase-js'], jsx: 'automatic', logLevel: 'silent' });
const { validarReuniao, corpoEvento, eventoId, protegerToken, abrirToken, presentesAtivos, baloesAtivos } = createRequire(import.meta.url)(file);
const { Cafe } = createRequire(import.meta.url)(file);
after(async () => { await rm(file, { force: true }); });
const id = '00000000-0000-4000-8000-000000000001', sala = '00000000-0000-4000-8000-000000000002', outro = '00000000-0000-4000-8000-000000000003';
const pedido = { id, escritorioId: sala, titulo: ' Alinhamento ', pauta: ' Pauta ', inicio: '2030-12-01T10:00:00-03:00', fim: '2030-12-01T11:00:00-03:00', convidados: [outro] };

test('reuniões validam identificadores, datas, duração e participantes cadastrados', () => {
  const valido = validarReuniao(pedido);
  assert.equal(valido.inicio, '2030-12-01T13:00:00.000Z'); assert.equal(valido.titulo, 'Alinhamento');
  for (const patch of [{ id: 'invalido' }, { convidados: ['email@example.com'] }, { convidados: [] }, { inicio: 'invalido' }, { fim: pedido.inicio }, { fim: '2030-12-02T10:00:00-03:00' }, { titulo: '' }, { pauta: 'x'.repeat(4001) }]) assert.throws(() => validarReuniao({ ...pedido, ...patch }));
});
test('retentativas reutilizam o mesmo evento e a mesma solicitação de Meet', () => {
  const p = validarReuniao(pedido), a = corpoEvento(p, ['a@example.com', 'a@example.com']), b = corpoEvento(p, ['a@example.com']);
  assert.deepEqual(a, b); assert.match(eventoId(id), /^[0-9a-v]+$/);
  assert.equal(a.conferenceData.createRequest.requestId, id); assert.equal(a.attendees.length, 1);
  assert.equal(a.guestsCanModify, false); assert.equal(a.guestsCanInviteOthers, false);
  assert.notEqual(eventoId(id), eventoId(outro));
});
test('tokens Google são criptografados e adulterações são rejeitadas', () => {
  const keys = ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_TOKEN_ENCRYPTION_KEY','APP_URL'];
  const antigos = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  Object.assign(process.env, { GOOGLE_CLIENT_ID: 'teste', GOOGLE_CLIENT_SECRET: 'teste', GOOGLE_TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32), APP_URL: 'https://desk-events.example' });
  try {
    const token = 'token-de-teste', seguro = protegerToken(token);
    assert.ok(!seguro.includes(token)); assert.equal(abrirToken(seguro), token);
    assert.notEqual(protegerToken(token), seguro, 'cada criptografia usa um nonce novo');
    const partes = seguro.split('.'); partes[2] = Buffer.from('adulterado').toString('base64url');
    assert.throws(() => abrirToken(partes.join('.')));
  } finally { for (const k of keys) if (antigos[k] === undefined) delete process.env[k]; else process.env[k] = antigos[k]; }
});
test('presença expira e balões só aparecem para pessoas no café durante 12 segundos', () => {
  const agora = Date.parse('2030-01-01T12:00:00Z');
  const pessoas = [{ user_id: id, zona: 'cafe', visto_em: new Date(agora - 1000).toISOString() }, { user_id: outro, zona: 'geral', visto_em: new Date(agora - 71000).toISOString() }];
  assert.deepEqual(presentesAtivos(pessoas, agora).map(p => p.user_id), [id]);
  const mensagens = [{ id: 'velha', user_id: id, texto: 'Expirou', criado_em: new Date(agora - 13000).toISOString() }, { id: 'nova', user_id: id, texto: 'Oi', criado_em: new Date(agora - 1000).toISOString() }, { id: 'fora', user_id: outro, texto: 'Fora', criado_em: new Date(agora - 1000).toISOString() }];
  assert.deepEqual(Object.keys(baloesAtivos(mensagens, pessoas, agora)), [id]);
  assert.equal(baloesAtivos(mensagens, pessoas, agora)[id].texto, 'Oi');
  assert.deepEqual(baloesAtivos(mensagens, pessoas, agora + 13000), {});
});
test('chat renderiza textos como conteúdo, sem executar HTML enviado por usuários', () => {
  const html = renderToStaticMarkup(React.createElement(Cafe, { pessoas: [], userId: id, mensagens: [{ id:'m', user_id:id, destinatario:null, texto:'<img src=x onerror=alert(1)>', criado_em:new Date().toISOString() }], onEnviar: async () => {} }));
  assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('<img src=x'));
});
