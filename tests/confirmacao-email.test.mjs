import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFile, rm, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const arquivo = resolve('node_modules/.cache/confirmacao-tests.cjs');
await mkdir(resolve('node_modules/.cache'), { recursive: true });
await build({ stdin: { contents: "export * from './apps/desktop/src/confirmacaoEmail'; export * from './apps/desktop/src/ConfirmarEmail';", resolveDir: process.cwd(), loader: 'tsx' }, outfile: arquivo, bundle: true, platform: 'node', format: 'cjs', packages: 'external', loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' }, jsx: 'automatic', logLevel: 'silent' });
const { lerLinkConfirmacao, ehPaginaConfirmacao, confirmarEmail, mensagemConfirmacao, urlConfirmacao, ConfirmarEmail } = createRequire(import.meta.url)(arquivo);
after(() => rm(arquivo, { force: true }));
const base = 'https://desk-events.vercel.app/confirmar-email';
function authMock({ error = null, confirmado = true } = {}) {
  const chamadas = [];
  const auth = Object.fromEntries(['verifyOtp', 'setSession', 'exchangeCodeForSession'].map(nome => [nome, async parametros => { chamadas.push([nome, parametros]); return { data: {}, error }; }]));
  auth.getUser = async () => { chamadas.push(['getUser']); return { data: { user: { email_confirmed_at: confirmado ? '2026-11-10' : null } }, error: null }; };
  return { auth, chamadas };
}
test('token personalizado valida antes de apresentar sucesso', async () => {
  const { auth, chamadas } = authMock();
  assert.deepEqual(await confirmarEmail(auth, lerLinkConfirmacao(base + '?token_hash=teste&type=email')), { estado: 'sucesso' });
  assert.deepEqual(chamadas, [['verifyOtp', { token_hash: 'teste', type: 'email' }], ['getUser']]);
});
test('retorno padrão e PKCE são processados pelo método correto', async () => {
  for (const [sufixo, metodo] of [['#access_token=a&refresh_token=b&type=signup', 'setSession'], ['?code=c', 'exchangeCodeForSession']]) {
    const { auth, chamadas } = authMock();
    assert.equal((await confirmarEmail(auth, lerLinkConfirmacao(base + sufixo))).estado, 'sucesso');
    assert.equal(chamadas[0][0], metodo);
  }
});
test('link expirado não aproveita sessão antiga nem reflete texto externo', async () => {
  const { auth, chamadas } = authMock();
  const resultado = await confirmarEmail(auth, lerLinkConfirmacao(base + '#error=access_denied&error_code=otp_expired&error_description=texto-nao-confiavel'));
  assert.equal(resultado.estado, 'erro'); assert.match(resultado.mensagem, /expirou/);
  assert.doesNotMatch(resultado.mensagem, /texto-nao-confiavel/); assert.deepEqual(chamadas, []);
});
test('ausência, token incompleto e outros fluxos não confirmam contas', async () => {
  const { auth, chamadas } = authMock();
  assert.equal((await confirmarEmail(auth, lerLinkConfirmacao(base))).estado, 'aguardando');
  for (const sufixo of ['?token_hash=', '#access_token=a', '?token_hash=x&type=recovery', '?token_hash=x&type=invite'])
    assert.equal((await confirmarEmail(auth, lerLinkConfirmacao(base + sufixo))).estado, 'erro');
  assert.deepEqual(chamadas, []);
});
test('erros do provedor, rede e usuário não confirmado nunca indicam sucesso', async () => {
  const link = lerLinkConfirmacao(base + '?token_hash=teste&type=email');
  for (const config of [{ error: { code: 'otp_expired' } }, { confirmado: false }, { error: { status: 500 } }]) {
    assert.equal((await confirmarEmail(authMock(config).auth, link)).estado, 'erro');
  }
  const { auth } = authMock(); auth.verifyOtp = async () => { throw Error('offline'); };
  assert.match((await confirmarEmail(auth, link)).mensagem, /conectar/);
  assert.match(mensagemConfirmacao({ status: 429 }), /minuto/);
});
test('rota de confirmação e destino são locais; next não redireciona', () => {
  assert.equal(urlConfirmacao('https://desk-events.vercel.app'), base);
  assert.equal(ehPaginaConfirmacao(base + '/'), true);
  assert.equal(ehPaginaConfirmacao('https://desk-events.vercel.app/#type=signup&access_token=a'), true);
  assert.equal(ehPaginaConfirmacao('https://desk-events.vercel.app/#type=recovery'), false);
  assert.equal(ehPaginaConfirmacao('https://desk-events.vercel.app/'), false);
  assert.deepEqual(lerLinkConfirmacao(base + '?next=https://example.com'), { modo: 'ausente' });
});
test('tela após cadastro mostra destinatário e limita reenvio inicial', () => {
  globalThis.window = { location: { href: base } };
  try {
    const html = renderToStaticMarkup(React.createElement(ConfirmarEmail, { emailEnviado: 'qa@example.com' }));
    assert.match(html, /Confira seu e-mail/); assert.match(html, /qa@example.com/);
    assert.match(html, /disabled=""[^>]*>Reenviar em 60s/); assert.doesNotMatch(html, /supabase/i);
  } finally { delete globalThis.window; }
});
test('template abre o site diretamente e Vercel serve a rota', async () => {
  const template = await readFile('supabase/templates/confirmar-email.html', 'utf8');
  assert.match(template, /\{\{ .SiteURL \}\}\/confirmar-email\?token_hash=\{\{ .TokenHash \}\}/);
  assert.doesNotMatch(template, /ConfirmationURL|supabase.co/);
  const vercel = JSON.parse(await readFile('apps/desktop/vercel.json', 'utf8'));
  assert.ok(vercel.rewrites.some(r => r.source === '/confirmar-email' && r.destination === '/index.html'));
});
