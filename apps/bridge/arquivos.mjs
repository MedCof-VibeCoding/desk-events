// Operações de arquivo da ponte local. Tudo fica preso dentro da pasta de trabalho.
import fs from 'node:fs/promises';
import path from 'node:path';
import { rodar } from './comandos.mjs';

const MAX_LER = 200_000, MAX_GRAVAR = 1_000_000, MAX_LISTA = 200;
// Antes de substituir um arquivo, a versão anterior é guardada aqui (dentro da pasta de trabalho).
export const COPIAS = '.deskcof-copias';
const TEXTO = /\.(txt|md|markdown|csv|tsv|json|jsonl|yaml|yml|xml|html?|css|js|mjs|ts|tsx|jsx|py|sql|log|ini|toml|env\.example|srt|rtf)$/i;

// Resolve um caminho relativo e recusa qualquer coisa que saia da pasta de trabalho,
// inclusive por atalho (link simbólico).
export async function seguro(raiz, relativo, paraGravar = false) {
  const pedido = String(relativo ?? '').trim();
  if (path.isAbsolute(pedido) || /^[a-zA-Z]:/.test(pedido) || pedido.startsWith('\\\\')) throw new Error('Use um caminho relativo à pasta de trabalho.');
  const raizReal = await fs.realpath(raiz);
  const alvo = path.resolve(raizReal, pedido || '.');
  const dentro = p => { const r = path.relative(raizReal, p); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
  if (!dentro(alvo)) throw new Error('Esse caminho fica fora da pasta de trabalho.');
  // Confere o caminho real do que já existe (o próprio alvo, ou a pasta mais próxima que existe).
  let existente = alvo;
  for (;;) {
    try { const real = await fs.realpath(existente); if (!dentro(real)) throw new Error('Esse caminho leva para fora da pasta de trabalho.'); break; }
    catch (e) { if (e.code !== 'ENOENT') throw e; const pai = path.dirname(existente); if (pai === existente) break; existente = pai; }
  }
  if (paraGravar && alvo === raizReal) throw new Error('Informe o nome do arquivo.');
  return alvo;
}

export async function listar(raiz, pasta) {
  const alvo = await seguro(raiz, pasta);
  const itens = await fs.readdir(alvo, { withFileTypes: true });
  if (!itens.length) return 'A pasta está vazia.';
  const linhas = [];
  for (const it of itens.slice(0, MAX_LISTA)) {
    if (it.isDirectory()) linhas.push(`[pasta] ${it.name}/`);
    else if (it.isFile()) { const st = await fs.stat(path.join(alvo, it.name)); linhas.push(`${it.name} (${st.size < 1024 ? st.size + ' B' : Math.round(st.size / 1024) + ' KB'})`); }
  }
  if (itens.length > MAX_LISTA) linhas.push(`... e mais ${itens.length - MAX_LISTA} itens`);
  return linhas.join('\n');
}

export async function ler(raiz, caminho) {
  const alvo = await seguro(raiz, caminho);
  const st = await fs.stat(alvo);
  if (!st.isFile()) throw new Error('Isso é uma pasta, não um arquivo.');
  if (!TEXTO.test(alvo)) throw new Error('Só é possível ler arquivos de texto (txt, md, csv, json e parecidos).');
  const buf = await fs.readFile(alvo);
  const texto = buf.subarray(0, MAX_LER).toString('utf8');
  return buf.length > MAX_LER ? texto + `\n\n[arquivo cortado: mostrados ${MAX_LER} de ${buf.length} bytes]` : texto;
}

export async function gravar(raiz, caminho, conteudo) {
  const alvo = await seguro(raiz, caminho, true);
  const texto = String(conteudo ?? '');
  if (Buffer.byteLength(texto) > MAX_GRAVAR) throw new Error('O conteúdo passa do limite de 1 MB.');
  if (!TEXTO.test(alvo)) throw new Error('Só é possível gravar arquivos de texto (txt, md, csv, json e parecidos).');
  const raizReal = await fs.realpath(raiz);
  const relativo = path.relative(raizReal, alvo);
  if (relativo.split(path.sep)[0].toLowerCase() === COPIAS) throw new Error('A pasta de cópias de segurança não pode ser alterada pelos agentes.');
  const existia = await fs.stat(alvo).then(() => true, () => false);
  let copia = '';
  if (existia) {
    const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
    const destino = path.join(raizReal, COPIAS, carimbo, relativo);
    await fs.mkdir(path.dirname(destino), { recursive: true });
    await fs.copyFile(alvo, destino);
    copia = ` A versão anterior foi guardada em ${path.relative(raizReal, destino).split(path.sep).join('/')}.`;
  }
  await fs.mkdir(path.dirname(alvo), { recursive: true });
  await fs.writeFile(alvo, texto, 'utf8');
  return `${existia ? 'Arquivo substituído' : 'Arquivo criado'}: ${relativo.split(path.sep).join('/')} (${Buffer.byteLength(texto)} bytes).${copia}`;
}

export async function executar(raiz, ferramenta, args, opcoes = {}) {
  if (ferramenta === 'rodar_comando') return rodar(await fs.realpath(raiz), args?.comando, { habilitado: opcoes.comandos === true });
  if (ferramenta === 'listar_arquivos') return listar(raiz, args?.pasta);
  if (ferramenta === 'ler_arquivo') return ler(raiz, args?.caminho);
  if (ferramenta === 'escrever_arquivo') return gravar(raiz, args?.caminho, args?.conteudo);
  throw new Error(`A ponte não conhece a ferramenta "${ferramenta}".`);
}
