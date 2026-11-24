// A ponte guarda a versão anterior antes de substituir um arquivo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises'; import os from 'node:os'; import path from 'node:path';
import { executar, COPIAS } from '../apps/bridge/arquivos.mjs';

test('substituir guarda cópia; criar não; a pasta de cópias é protegida', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'ponte-'));
  const novo = await executar(raiz, 'escrever_arquivo', { caminho: 'docs/plano.md', conteudo: 'v1' });
  assert.match(novo, /^Arquivo criado/); assert.doesNotMatch(novo, /versão anterior/);
  const troca = await executar(raiz, 'escrever_arquivo', { caminho: 'docs/plano.md', conteudo: 'v2' });
  const guardado = troca.match(/guardada em (\S+)\.$/)[1];
  assert.ok(guardado.startsWith(`${COPIAS}/`) && guardado.endsWith('/docs/plano.md'));
  assert.equal(await fs.readFile(path.join(raiz, guardado), 'utf8'), 'v1');
  assert.equal(await fs.readFile(path.join(raiz, 'docs/plano.md'), 'utf8'), 'v2');
  await assert.rejects(executar(raiz, 'escrever_arquivo', { caminho: guardado, conteudo: 'apagado' }), /cópias de segurança/);
  await assert.rejects(executar(raiz, 'escrever_arquivo', { caminho: '.DESKCOF-COPIAS/x.md', conteudo: 'x' }), /cópias de segurança/);
  await fs.rm(raiz, { recursive: true });
});
