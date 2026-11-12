import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises'; import os from 'node:os'; import path from 'node:path';
import { Conector } from './core.js';
import { executar } from './ponte/arquivos.mjs';

// Supabase falso, só com o que o Conector usa.
function falso({ sala = 'sala-1', semUsuario = false } = {}) {
  const banco = { pontes: [], tarefas_locais: [] };
  const q = tabela => {
    const f = { filtros: [], acao: 'select', dados: null };
    const linhas = () => banco[tabela].filter(l => f.filtros.every(([c, v, op]) => op === 'like' ? String(l[c]).startsWith(v.replace('%', '')) : l[c] === v));
    const api = {
      select() { return api; }, order() { return api; }, limit() { return api; },
      eq(c, v) { f.filtros.push([c, v]); return api; }, like(c, v) { f.filtros.push([c, v, 'like']); return api; },
      update(d) { f.acao = 'update'; f.dados = d; return api; },
      delete() { f.acao = 'delete'; return api; },
      upsert(d) { const i = banco[tabela].findIndex(l => l.user_id === d.user_id); if (i >= 0) banco[tabela][i] = d; else banco[tabela].push(d); return Promise.resolve({ error: null }); },
      then(ok, falha) {
        let r;
        if (f.acao === 'update') { const ls = linhas(); ls.forEach(l => Object.assign(l, f.dados)); r = { data: ls.map(l => ({ id: l.id })), error: null }; }
        else if (f.acao === 'delete') { const fora = new Set(linhas()); banco[tabela] = banco[tabela].filter(l => !fora.has(l)); r = { error: null }; }
        else r = { data: linhas().map(l => ({ ...l })), error: null };
        return Promise.resolve(r).then(ok, falha);
      }
    };
    return api;
  };
  return { banco, cliente: { from: q, auth: { getUser: async () => ({ data: { user: semUsuario ? null : { id: 'u1' } } }) }, rpc: async () => ({ data: sala, error: null }) } };
}

test('liga, avisa o escritório e atende pedidos de arquivo', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'conector-'));
  await fs.writeFile(path.join(raiz, 'nota.md'), '# Olá');
  const { banco, cliente } = falso();
  const c = new Conector({ supabase: cliente, executar });
  await c.ligar({ raiz, comandos: false });
  assert.equal(banco.pontes.length, 1);
  assert.match(banco.pontes[0].nome, /^conector:/);
  assert.equal(banco.pontes[0].pasta, raiz);
  banco.tarefas_locais.push({ id: 't1', user_id: 'u1', estado: 'pendente', ferramenta: 'ler_arquivo', args: { caminho: 'nota.md' } });
  banco.tarefas_locais.push({ id: 't2', user_id: 'u1', estado: 'pendente', ferramenta: 'escrever_arquivo', args: { caminho: 'saida.md', conteudo: 'feito' } });
  banco.tarefas_locais.push({ id: 't3', user_id: 'outra', estado: 'pendente', ferramenta: 'ler_arquivo', args: { caminho: 'nota.md' } });
  await c.atender();
  assert.equal(banco.tarefas_locais[0].estado, 'feito'); assert.equal(banco.tarefas_locais[0].resultado, '# Olá');
  assert.equal(banco.tarefas_locais[1].estado, 'feito'); assert.equal(await fs.readFile(path.join(raiz, 'saida.md'), 'utf8'), 'feito');
  assert.equal(banco.tarefas_locais[2].estado, 'pendente', 'não atende pedido de outra pessoa');
  await c.desligar();
  assert.equal(banco.pontes.length, 0);
  await fs.rm(raiz, { recursive: true });
});

test('recusa fuga da pasta e comandos sem permissão', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'conector-'));
  const { banco, cliente } = falso();
  const c = new Conector({ supabase: cliente, executar });
  await c.ligar({ raiz, comandos: false });
  banco.tarefas_locais.push({ id: 'a', user_id: 'u1', estado: 'pendente', ferramenta: 'ler_arquivo', args: { caminho: '../../segredo.txt' } });
  banco.tarefas_locais.push({ id: 'b', user_id: 'u1', estado: 'pendente', ferramenta: 'rodar_comando', args: { comando: 'echo oi' } });
  await c.atender();
  assert.equal(banco.tarefas_locais[0].estado, 'erro'); assert.match(banco.tarefas_locais[0].resultado, /fora da pasta/);
  assert.equal(banco.tarefas_locais[1].estado, 'erro'); assert.match(banco.tarefas_locais[1].resultado, /sem permissão para comandos/);
  await c.ligar({ raiz, comandos: true });
  banco.tarefas_locais.push({ id: 'c', user_id: 'u1', estado: 'pendente', ferramenta: 'rodar_comando', args: { comando: 'echo oi' } });
  await c.atender();
  assert.equal(banco.tarefas_locais[2].estado, 'feito'); assert.match(banco.tarefas_locais[2].resultado, /oi/);
  assert.match(banco.pontes[0].nome, /\(comandos\)/);
  await c.desligar(); await fs.rm(raiz, { recursive: true });
});

test('sem login, não liga', async () => {
  const { cliente } = falso({ semUsuario: true });
  await assert.rejects(new Conector({ supabase: cliente, executar }).ligar({ raiz: os.tmpdir() }), /Entre com a sua conta/);
});
