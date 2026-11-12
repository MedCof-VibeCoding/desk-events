// Ponte local dentro do escritório. A aba escolhe uma pasta deste computador
// e atende os pedidos de arquivo dos agentes, com a sessão que já está aberta.
import { supabase } from './supabase';

/** Tempo sem batimento depois do qual a ponte conta como desligada. */
export const SINAL_PONTE_MS = 120_000;

const MAX_LER = 200_000;
const MAX_GRAVAR = 1_000_000;
const MAX_LISTA = 200;
const TEXTO = /\.(txt|md|markdown|csv|tsv|json|jsonl|yaml|yml|xml|html?|css|js|mjs|ts|tsx|jsx|py|sql|log|ini|toml|env\.example|srt|rtf)$/i;

declare global {
  interface FileSystemHandle {
    queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  }
  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
  }
  interface Window {
    showDirectoryPicker(options?: { mode?: 'read' | 'readwrite'; startIn?: 'documents' }): Promise<FileSystemDirectoryHandle>;
  }
}

type Args = { pasta?: string; caminho?: string; conteudo?: string };
type PonteAtiva = { userId: string; raiz: FileSystemDirectoryHandle; token: string; parar: () => void };

let ativa: PonteAtiva | null = null;
let guardada: FileSystemDirectoryHandle | null = null;
let escolhida = false;
const emCurso = new Set<string>();

void lerPasta().then(pasta => { if (!escolhida) guardada = pasta; }).catch(() => {});

/**
 * Diz se este navegador deixa a pessoa escolher uma pasta.
 */
export function navegadorComPasta(): boolean {
  return typeof window.showDirectoryPicker === 'function';
}

/**
 * Liga a ponte nesta aba, na pasta já autorizada ou numa pasta nova.
 * Devolve o nome da pasta, ou null se a pessoa cancelar o seletor.
 */
export async function ligarPonte(userId: string, escritorioId: string, novaPasta = false): Promise<string | null> {
  if (ativa && !novaPasta) return ativa.raiz.name;
  const raiz = await escolherPasta(novaPasta);
  if (raiz && ativa) parar(ativa);
  if (!raiz) return null;
  const token = await tokenAtual();
  if (!token) throw new Error('Faça login para continuar.');
  await bater(userId, escritorioId, raiz.name);
  const pulso = window.setInterval(() => { void bater(userId, escritorioId, raiz.name).catch(() => {}); }, 20_000);
  const fila = window.setInterval(() => { void atender(userId, raiz).catch(() => {}); }, 3_000);
  const canal = supabase.channel(`ponte-aba-${userId}-${Date.now()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tarefas_locais', filter: `user_id=eq.${userId}` }, () => { void atender(userId, raiz).catch(() => {}); })
    .subscribe();
  const aoVoltar = () => { if (document.visibilityState === 'visible') void bater(userId, escritorioId, raiz.name).catch(() => {}); };
  const aoFechar = () => fecharAba();
  document.addEventListener('visibilitychange', aoVoltar);
  window.addEventListener('pagehide', aoFechar);
  ativa = {
    userId, raiz, token,
    parar: () => {
      window.clearInterval(pulso);
      window.clearInterval(fila);
      void supabase.removeChannel(canal);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('pagehide', aoFechar);
    },
  };
  void atender(userId, raiz).catch(() => {});
  return raiz.name;
}

/**
 * Religa sozinha, sem perguntar nada, quando o navegador já deu permissão permanente
 * para a pasta guardada (no Chrome, a opção "Permitir em todas as visitas").
 * Devolve o nome da pasta, ou null se ainda for preciso um clique da pessoa.
 */
export async function retomarPonte(userId: string, escritorioId: string): Promise<string | null> {
  if (ativa) return ativa.raiz.name;
  if (!navegadorComPasta()) return null;
  const pasta = guardada ?? await lerPasta().catch(() => null);
  if (!pasta) return null;
  try { if (await pasta.queryPermission({ mode: 'readwrite' }) !== 'granted') return null; } catch { return null; }
  guardada = pasta;
  return ligarPonte(userId, escritorioId);
}

/** Nome da última pasta usada neste navegador, para oferecer "Reconectar". */
export async function pastaGuardada(): Promise<string | null> {
  const pasta = guardada ?? await lerPasta().catch(() => null);
  return pasta?.name ?? null;
}

/**
 * Desliga a ponte desta aba e apaga o registro no escritório.
 */
export async function desligarPonte(): Promise<void> {
  const atual = ativa;
  if (!atual) return;
  const { error } = await supabase.from('pontes').delete().eq('user_id', atual.userId);
  if (error) throw new Error(error.message);
  parar(atual);
}

/**
 * Pede a pasta. Reusa a última autorização; se a pessoa recusar, abre o seletor.
 */
async function escolherPasta(novaPasta = false): Promise<FileSystemDirectoryHandle | null> {
  if (!navegadorComPasta()) throw new Error('Este navegador não deixa escolher uma pasta. Use Chrome ou Edge, ou ligue pelo terminal com: npm run ponte');
  if (guardada && !novaPasta) {
    try {
      if (await guardada.requestPermission({ mode: 'readwrite' }) === 'granted') return guardada;
    } catch { guardada = null; }
  }
  try {
    const nova = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
    escolhida = true;
    guardada = nova;
    void guardarPasta(nova).catch(() => {});
    return nova;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}

/**
 * Avisa o escritório que esta ponte continua ligada.
 */
async function bater(userId: string, escritorioId: string, pasta: string): Promise<void> {
  const token = await tokenAtual();
  if (ativa && token) ativa.token = token;
  const { error } = await supabase.from('pontes').upsert({
    user_id: userId, escritorio_id: escritorioId, nome: 'navegador', pasta, visto_em: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

/**
 * Lê a sessão atual para renovar o token usado ao fechar a aba.
 */
async function tokenAtual(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Pega as tarefas pendentes desta pessoa e responde uma a uma.
 */
async function atender(userId: string, raiz: FileSystemDirectoryHandle): Promise<void> {
  const { data } = await supabase.from('tarefas_locais').select('id, ferramenta, args').eq('user_id', userId).eq('estado', 'pendente').order('criado_em').limit(10);
  for (const t of data ?? []) {
    if (emCurso.has(t.id)) continue;
    emCurso.add(t.id);
    const { data: peguei } = await supabase.from('tarefas_locais').update({ estado: 'executando' }).eq('id', t.id).eq('estado', 'pendente').select('id');
    if (!peguei?.length) { emCurso.delete(t.id); continue; }
    try {
      const resultado = await executar(raiz, t.ferramenta, (t.args ?? {}) as Args);
      await supabase.from('tarefas_locais').update({ estado: 'feito', resultado }).eq('id', t.id);
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : String(e);
      await supabase.from('tarefas_locais').update({ estado: 'erro', resultado: mensagem.slice(0, 500) }).eq('id', t.id);
    }
    emCurso.delete(t.id);
  }
}

/**
 * Executa a ferramenta pedida, presa à pasta escolhida.
 */
async function executar(raiz: FileSystemDirectoryHandle, ferramenta: string, args: Args): Promise<string> {
  if (ferramenta === 'rodar_comando') throw new Error('A ponte do navegador não executa comandos. Para comandos, ligue com: npm run ponte -- --comandos');
  if (ferramenta === 'listar_arquivos') return listar(raiz, args.pasta);
  if (ferramenta === 'ler_arquivo') return ler(raiz, args.caminho);
  if (ferramenta === 'escrever_arquivo') return gravar(raiz, args.caminho, args.conteudo);
  throw new Error(`A ponte não conhece a ferramenta "${ferramenta}".`);
}

/**
 * Lista arquivos e pastas, no máximo 200 itens.
 */
async function listar(raiz: FileSystemDirectoryHandle, pasta: string | undefined): Promise<string> {
  const dir = await abrir(raiz, partir(pasta), false);
  const linhas: string[] = [];
  let total = 0;
  for await (const [nome, item] of dir.entries()) {
    total += 1;
    if (linhas.length >= MAX_LISTA) continue;
    if (item.kind === 'directory') { linhas.push(`[pasta] ${nome}/`); continue; }
    const arq = await item.getFile();
    linhas.push(`${nome} (${arq.size < 1024 ? arq.size + ' B' : Math.round(arq.size / 1024) + ' KB'})`);
  }
  if (!total) return 'A pasta está vazia.';
  if (total > MAX_LISTA) linhas.push(`... e mais ${total - MAX_LISTA} itens`);
  return linhas.join('\n');
}

/**
 * Lê um arquivo de texto, cortando em 200 mil bytes.
 */
async function ler(raiz: FileSystemDirectoryHandle, caminho: string | undefined): Promise<string> {
  const nomes = partir(caminho);
  const nome = nomes.pop();
  if (!nome) throw new Error('Isso é uma pasta, não um arquivo.');
  const dir = await abrir(raiz, nomes, false);
  const tipo = await tipoDe(dir, nome);
  if (tipo === 'nenhum') throw new Error('Não encontrei esse caminho na pasta de trabalho.');
  if (tipo === 'pasta') throw new Error('Isso é uma pasta, não um arquivo.');
  if (!TEXTO.test(nome)) throw new Error('Só é possível ler arquivos de texto (txt, md, csv, json e parecidos).');
  const arq = await (await dir.getFileHandle(nome)).getFile();
  const texto = await arq.slice(0, MAX_LER).text();
  return arq.size > MAX_LER ? `${texto}\n\n[arquivo cortado: mostrados ${MAX_LER} de ${arq.size} bytes]` : texto;
}

/**
 * Grava um arquivo de texto de até 1 MB, criando as pastas que faltarem.
 */
async function gravar(raiz: FileSystemDirectoryHandle, caminho: string | undefined, conteudo: string | undefined): Promise<string> {
  const nomes = partir(caminho);
  const nome = nomes.pop();
  if (!nome) throw new Error('Informe o nome do arquivo.');
  if (!TEXTO.test(nome)) throw new Error('Só é possível gravar arquivos de texto (txt, md, csv, json e parecidos).');
  const texto = String(conteudo ?? '');
  const tamanho = new TextEncoder().encode(texto).length;
  if (tamanho > MAX_GRAVAR) throw new Error('O conteúdo passa do limite de 1 MB.');
  const dir = await abrir(raiz, nomes, true);
  const tipo = await tipoDe(dir, nome);
  if (tipo === 'pasta') throw new Error('Isso é uma pasta, não um arquivo.');
  const destino = await (await dir.getFileHandle(nome, { create: true })).createWritable();
  await destino.write(texto);
  await destino.close();
  const relativo = [...nomes, nome].join('/');
  return `${tipo === 'arquivo' ? 'Arquivo substituído' : 'Arquivo criado'}: ${relativo} (${tamanho} bytes).`;
}

/**
 * Separa um caminho relativo e recusa absoluto ou que suba de pasta.
 */
function partir(relativo: string | undefined): string[] {
  const pedido = String(relativo ?? '').trim().replace(/\\/g, '/');
  if (!pedido || pedido === '.' || pedido === '/') return [];
  if (pedido.startsWith('/') || pedido.startsWith('//') || /^[a-zA-Z]:/.test(pedido)) throw new Error('Use um caminho relativo à pasta de trabalho.');
  const nomes = pedido.split('/').filter(p => p !== '' && p !== '.');
  if (nomes.some(p => p === '..')) throw new Error('Esse caminho fica fora da pasta de trabalho.');
  return nomes;
}

/**
 * Desce as pastas pedidas a partir da raiz escolhida.
 */
async function abrir(raiz: FileSystemDirectoryHandle, nomes: string[], criar: boolean): Promise<FileSystemDirectoryHandle> {
  let atual = raiz;
  for (const nome of nomes) {
    try { atual = await atual.getDirectoryHandle(nome, { create: criar }); }
    catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') throw new Error('Não encontrei esse caminho na pasta de trabalho.');
      throw e;
    }
  }
  return atual;
}

/**
 * Diz se o nome é arquivo, pasta ou se não existe.
 */
async function tipoDe(dir: FileSystemDirectoryHandle, nome: string): Promise<'arquivo' | 'pasta' | 'nenhum'> {
  try { await dir.getFileHandle(nome); return 'arquivo'; }
  catch (e) {
    if (!(e instanceof DOMException)) throw e;
    if (e.name === 'TypeMismatchError') return 'pasta';
    if (e.name !== 'NotFoundError') throw e;
  }
  try { await dir.getDirectoryHandle(nome); return 'pasta'; }
  catch (e) {
    if (!(e instanceof DOMException)) throw e;
    if (e.name === 'NotFoundError') return 'nenhum';
    if (e.name === 'TypeMismatchError') return 'arquivo';
    throw e;
  }
}

/**
 * Encerra os temporizadores desta aba.
 */
function parar(atual: PonteAtiva): void {
  if (ativa !== atual) return;
  ativa = null;
  atual.parar();
}

/**
 * Ao fechar a aba, apaga o registro mesmo que a página esteja indo embora.
 */
function fecharAba(): void {
  const atual = ativa;
  if (!atual) return;
  parar(atual);
  const url = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  const key = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '');
  if (!url || !key || !atual.token) return;
  void fetch(`${url}/rest/v1/pontes?user_id=eq.${encodeURIComponent(atual.userId)}`, {
    method: 'DELETE', keepalive: true,
    headers: { apikey: key, authorization: `Bearer ${atual.token}`, prefer: 'return=minimal' },
  });
}

/**
 * Abre o banco local que guarda a pasta autorizada.
 */
function banco(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open('desk-events-ponte', 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore('pasta');
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

/**
 * Lê a pasta autorizada na visita anterior.
 */
async function lerPasta(): Promise<FileSystemDirectoryHandle | null> {
  const db = await banco();
  const pasta = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const req = db.transaction('pasta', 'readonly').objectStore('pasta').get('raiz');
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return pasta;
}

/**
 * Guarda a pasta para a próxima visita pedir só a permissão.
 */
async function guardarPasta(pasta: FileSystemDirectoryHandle): Promise<void> {
  const db = await banco();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('pasta', 'readwrite');
    tx.objectStore('pasta').put(pasta, 'raiz');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
