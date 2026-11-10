import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const arquivo = resolve('node_modules/.cache/sendgrid-tests.cjs');
await mkdir(resolve('node_modules/.cache'), { recursive: true });
await build({ stdin: { contents: "export * from './apps/server/lib/auth-email'; export * from './apps/server/api/auth-email';", resolveDir: process.cwd(), loader: 'ts' }, outfile: arquivo, bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent' });
const { configuracaoEmail, verificarAssinatura, mensagensAuth, corpoSendGrid, enviarAuthEmail, POST } = createRequire(import.meta.url)(arquivo);
after(() => rm(arquivo, { force: true }));
const bytes = Buffer.alloc(32, 42), secret = 'v1,whsec_' + bytes.toString('base64');
const env = { SENDGRID_API_KEY: 'fake-api-key', SENDGRID_FROM_EMAIL: 'desk@example.com', SEND_EMAIL_HOOK_SECRET: secret, APP_URL: 'https://desk-events.vercel.app', SUPABASE_URL: 'https://example.supabase.co' };
const config = configuracaoEmail(env);
const payload = { user: { email: 'test@example.com' }, email_data: { email_action_type: 'signup', token_hash: 'hash-only-for-tests', redirect_to: 'https://attacker.example/' } };
function assinar(raw, { timestamp = Math.floor(Date.now() / 1000), id = 'test-hook', key = bytes } = {}) {
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest('base64');
  return new Headers({ 'webhook-id': id, 'webhook-timestamp': String(timestamp), 'webhook-signature': `v1,${signature}`, 'content-type': 'application/json' });
}
test('configuração exige remetente, chave e segredo e rejeita URLs inseguras', () => {
  for (const key of ['SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL', 'SEND_EMAIL_HOOK_SECRET']) assert.throws(() => configuracaoEmail({ ...env, [key]: '' }));
  assert.throws(() => configuracaoEmail({ ...env, APP_URL: 'http://example.com' }));
  assert.throws(() => configuracaoEmail({ ...env, SENDGRID_FROM_EMAIL: 'a@example.com\nBcc: b@example.com' }));
  assert.equal(config.name, 'Desk Events');
});
test('assinatura Standard Webhooks valida o corpo original e aceita rotação na assinatura', () => {
  const raw = JSON.stringify(payload), headers = assinar(raw);
  verificarAssinatura(raw, headers, secret);
  verificarAssinatura(raw, headers, secret.replace('v1,', ''));
  headers.set('webhook-signature', 'v1,invalida ' + headers.get('webhook-signature'));
  verificarAssinatura(raw, headers, secret);
});
test('corpo adulterado, assinatura falsa, timestamp velho ou futuro são rejeitados', () => {
  const raw = JSON.stringify(payload);
  assert.throws(() => verificarAssinatura(raw + ' ', assinar(raw), secret), { status: 401 });
  assert.throws(() => verificarAssinatura(raw, new Headers(), secret), { status: 401 });
  assert.throws(() => verificarAssinatura(raw, assinar(raw, { key: Buffer.alloc(32, 7) }), secret), { status: 401 });
  for (const delta of [-301, 301]) assert.throws(() => verificarAssinatura(raw, assinar(raw, { timestamp: Math.floor(Date.now() / 1000) + delta }), secret), { status: 401 });
});
test('cadastro usa domínio próprio e ignora destino arbitrário do payload', () => {
  const m = mensagensAuth(payload, config)[0], url = new URL(m.link);
  assert.equal(url.origin, config.app); assert.equal(url.pathname, '/confirmar-email'); assert.equal(url.searchParams.get('token_hash'), payload.email_data.token_hash);
  assert.equal(url.searchParams.get('type'), 'email'); assert.equal(m.para, payload.user.email);
  const body = corpoSendGrid(m, config);
  assert.equal(body.tracking_settings.click_tracking.enable, false); assert.equal(body.tracking_settings.open_tracking.enable, false);
  assert.deepEqual(body.content.map(c => c.type), ['text/plain', 'text/html']);
  assert.doesNotMatch(JSON.stringify(body), /fake-api-key|attacker.example/);
});
test('alteração segura usa hash novo no endereço antigo e hash principal no novo', () => {
  const mensagens = mensagensAuth({ user: { email: 'old@example.com', new_email: 'new@example.com' }, email_data: { email_action_type: 'email_change', token_hash: 'new-address-hash', token_hash_new: 'old-address-hash' } }, config);
  assert.equal(mensagens.length, 2);
  assert.equal(new URL(mensagens.find(m => m.para === 'old@example.com').link).searchParams.get('token'), 'old-address-hash');
  assert.equal(new URL(mensagens.find(m => m.para === 'new@example.com').link).searchParams.get('token'), 'new-address-hash');
});
test('alteração simples, códigos e demais tipos mantêm envio coerente', () => {
  const simples = mensagensAuth({ user: { email: 'old@example.com', new_email: 'new@example.com' }, email_data: { email_action_type: 'email_change', token_hash: 'new-address-hash' } }, config);
  assert.equal(simples.length, 1); assert.equal(simples[0].para, 'new@example.com');
  const otp = mensagensAuth({ ...payload, email_data: { email_action_type: 'reauthentication', token: '123456' } }, config)[0];
  assert.equal(otp.codigo, '123456'); assert.equal(otp.link, undefined);
  for (const tipo of ['recovery', 'magiclink', 'invite']) {
    const m = mensagensAuth({ ...payload, email_data: { ...payload.email_data, email_action_type: tipo } }, config)[0];
    const url = new URL(m.link); assert.equal(url.origin, config.supabase); assert.equal(url.searchParams.get('type'), tipo);
    assert.equal(url.searchParams.get('redirect_to'), config.app + '/');
  }
});
test('mensagens inválidas ou sem token não chegam ao provedor', async () => {
  let chamadas = 0;
  for (const p of [null, {}, { ...payload, user: { email: 'invalid' } }, { ...payload, email_data: { email_action_type: 'signup' } }, { ...payload, email_data: { email_action_type: 'unknown' } }])
    await assert.rejects(enviarAuthEmail(p, config, async () => { chamadas++; }), { status: 400 });
  assert.equal(chamadas, 0);
});
test('SendGrid recebe chave só no Authorization e sucesso apenas após 202', async () => {
  await enviarAuthEmail(payload, config, async (url, req) => {
    assert.equal(url, 'https://api.sendgrid.com/v3/mail/send'); assert.equal(req.method, 'POST');
    assert.equal(req.headers.authorization, 'Bearer fake-api-key'); assert.ok(req.signal);
    assert.doesNotMatch(req.body, /fake-api-key/); return new Response(null, { status: 202 });
  });
  for (const status of [200, 400, 401, 403, 429, 500]) await assert.rejects(enviarAuthEmail(payload, config, async () => new Response(null, { status })), { status: status === 429 ? 429 : 502 });
  await assert.rejects(enviarAuthEmail(payload, config, async () => { throw new Error('provider details'); }), { code: 'email_provider_unavailable' });
});
test('endpoint não envia sem assinatura e não vaza erros do provedor', async () => {
  const old = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]])), originalFetch = globalThis.fetch;
  Object.assign(process.env, env); let chamadas = 0;
  globalThis.fetch = async () => { chamadas++; return new Response('private-provider-details', { status: 403 }); };
  try {
    const raw = JSON.stringify(payload);
    assert.equal((await POST(new Request('https://server/api/auth-email', { method: 'POST', body: raw }))).status, 401);
    assert.equal(chamadas, 0);
    const bad = await POST(new Request('https://server/api/auth-email', { method: 'POST', body: raw, headers: assinar(raw) }));
    assert.equal(bad.status, 502); assert.doesNotMatch(await bad.text(), /private-provider-details|fake-api-key|test@example.com|hash-only/);
    globalThis.fetch = async () => new Response(null, { status: 202 });
    const ok = await POST(new Request('https://server/api/auth-email', { method: 'POST', body: raw, headers: assinar(raw) }));
    assert.equal(ok.status, 200); assert.deepEqual(await ok.json(), {});
    const big = 'x'.repeat(65537);
    assert.equal((await POST(new Request('https://server/api/auth-email', { method: 'POST', body: big, headers: assinar(big) }))).status, 413);
  } finally { globalThis.fetch = originalFetch; for (const [k, v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
});
