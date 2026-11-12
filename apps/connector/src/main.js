// DeskCof Conector: fica na bandeja do Windows e mantém uma pasta deste computador
// conectada ao escritório, mesmo com o site fechado.
import { app, BrowserWindow, Tray, Menu, ipcMain, dialog, safeStorage, shell, Notification, nativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { Conector } from './core.js';
import { executar } from './ponte/arquivos.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const SITE = 'https://desk-events.vercel.app';
const dados = () => app.getPath('userData');
const ARQ_CONFIG = () => path.join(dados(), 'conector.json');
const ARQ_SESSAO = () => path.join(dados(), 'sessao.bin');
const ARQ_SITE = () => path.join(dados(), 'site.json');

let janela = null, bandeja = null, supabase = null, conector = null;
let erro = '', email = '', pausado = false;
const log = [];

function lerJson(arq, padrao) { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } }
function gravarJson(arq, v) { fs.mkdirSync(path.dirname(arq), { recursive: true }); fs.writeFileSync(arq, JSON.stringify(v, null, 2)); }
const config = () => lerJson(ARQ_CONFIG(), { pasta: path.join(app.getPath('documents'), 'Agentes'), comandos: false, iniciarComWindows: true });
const salvarConfig = mudanca => gravarJson(ARQ_CONFIG(), { ...config(), ...mudanca });

// A sessão fica cifrada pela conta do Windows; ninguém lê o arquivo copiando-o para outra máquina.
function lerSessao() {
  try { const b = fs.readFileSync(ARQ_SESSAO()); return JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString('utf8')); } catch { return {}; }
}
function gravarSessao(obj) {
  const texto = JSON.stringify(obj);
  fs.mkdirSync(dados(), { recursive: true });
  fs.writeFileSync(ARQ_SESSAO(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(texto) : Buffer.from(texto, 'utf8'));
}
const guarda = {
  getItem: k => lerSessao()[k] ?? null,
  setItem: (k, v) => { const s = lerSessao(); s[k] = v; gravarSessao(s); },
  removeItem: k => { const s = lerSessao(); delete s[k]; gravarSessao(s); }
};

// Endereço e chave pública do banco vêm do próprio site, e ficam guardados para abrir sem internet.
async function configSite() {
  try {
    const r = await fetch(`${SITE}/conector-config.json`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (r.ok) { const c = await r.json(); if (c.supabaseUrl && c.anonKey) { gravarJson(ARQ_SITE(), c); return c; } }
  } catch { /* sem internet: usa a cópia guardada */ }
  const c = lerJson(ARQ_SITE(), null);
  if (!c) throw new Error('Não foi possível falar com o DeskCof. Verifique a internet e abra o Conector de novo.');
  return c;
}

function avisar(evento) {
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const NOME = { listar_arquivos: 'Listou a pasta', ler_arquivo: 'Leu', escrever_arquivo: 'Gravou', rodar_comando: 'Rodou o comando' };
  if (evento.tipo === 'feito') log.unshift(`${hora}  ${NOME[evento.ferramenta] ?? evento.ferramenta} ${evento.alvo}`.trim());
  if (evento.tipo === 'recusado') log.unshift(`${hora}  Recusado: ${evento.mensagem}`);
  if (evento.tipo === 'erro') erro = evento.mensagem;
  if (evento.tipo === 'reconectado') erro = '';
  log.length = Math.min(log.length, 30);
  enviarEstado();
}

function estado() {
  const c = config();
  return { logado: !!email, email, pasta: c.pasta, comandos: c.comandos, iniciarComWindows: c.iniciarComWindows,
    ligado: !!conector?.ligado && !pausado, pausado, erro, feitos: conector?.feitos ?? 0, log, versao: app.getVersion() };
}
function enviarEstado() {
  const e = estado();
  janela?.webContents.send('estado', e);
  if (bandeja) {
    bandeja.setToolTip(e.ligado ? `DeskCof Conector: conectado\nPasta: ${e.pasta}` : e.logado ? 'DeskCof Conector: pausado' : 'DeskCof Conector: entre com a sua conta');
    bandeja.setContextMenu(Menu.buildFromTemplate([
      { label: e.ligado ? 'Conectado' : e.logado ? 'Pausado' : 'Desconectado', enabled: false },
      { type: 'separator' },
      { label: 'Abrir o Conector', click: mostrar },
      { label: 'Abrir a pasta dos agentes', enabled: e.logado, click: () => void shell.openPath(e.pasta) },
      { label: e.pausado ? 'Retomar' : 'Pausar', enabled: e.logado, click: () => void alternarPausa(!pausado) },
      { type: 'separator' },
      { label: 'Fechar o Conector', click: () => { app.isQuitting = true; app.quit(); } }
    ]));
  }
}

// Cria a conexão com o banco; tenta de novo a cada chamada se a internet tiver falhado antes.
async function garantirCliente() {
  if (supabase) return;
  const site = await configSite();
  supabase = createClient(site.supabaseUrl, site.anonKey, { auth: { storage: guarda, storageKey: 'sessao', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  conector = new Conector({ supabase, executar, aviso: avisar });
}

async function ligar() {
  if (!conector || pausado || !email) return;
  const c = config();
  fs.mkdirSync(c.pasta, { recursive: true });
  try { await conector.ligar({ raiz: c.pasta, comandos: c.comandos }); erro = ''; }
  catch (e) { erro = e.message; }
  enviarEstado();
}

async function alternarPausa(p) {
  pausado = p;
  if (p) await conector?.desligar(); else await ligar();
  enviarEstado();
}

function mostrar() {
  if (!janela) {
    janela = new BrowserWindow({ width: 440, height: 720, resizable: false, maximizable: false, title: 'DeskCof Conector', icon: path.join(aqui, 'icone.png'),
      autoHideMenuBar: true, backgroundColor: '#0c0c0c', show: false,
      webPreferences: { preload: path.join(aqui, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
    janela.loadFile(path.join(aqui, 'janela.html'));
    janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    janela.webContents.on('will-navigate', e => e.preventDefault());
    // Fechar a janela não desliga: o Conector continua na bandeja.
    janela.on('close', e => { if (!app.isQuitting) { e.preventDefault(); janela.hide(); } });
    janela.once('ready-to-show', () => {
      janela.show();
      // Só para testes automáticos: grava uma imagem da janela e fecha.
      if (process.env.DESKCOF_CAPTURA) setTimeout(async () => { fs.writeFileSync(process.env.DESKCOF_CAPTURA, (await janela.webContents.capturePage()).toPNG()); app.isQuitting = true; app.quit(); }, 2500);
    });
  } else { janela.show(); janela.focus(); }
}

function registrarIpc() {
  ipcMain.handle('estado', () => estado());
  ipcMain.handle('entrar', async (_e, mail, senha) => {
    if (!mail.includes('@') || senha.length < 6) return { erro: 'Preencha o e-mail e a senha da sua conta do DeskCof.' };
    try { await garantirCliente(); } catch (e) { return { erro: e.message }; }
    erro = '';
    const { data, error } = await supabase.auth.signInWithPassword({ email: mail.trim(), password: senha });
    if (error || !data.user) return { erro: error?.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : (error?.message ?? 'Não foi possível entrar.') };
    email = data.user.email ?? mail; pausado = false;
    await ligar();
    if (conector?.ligado && Notification.isSupported()) new Notification({ title: 'DeskCof Conector', body: `Conectado. Os agentes já podem usar a pasta ${config().pasta}.` }).show();
    return { ok: true };
  });
  ipcMain.handle('escolher-pasta', async () => {
    const r = await dialog.showOpenDialog(janela, { title: 'Escolha a pasta que os agentes podem usar', defaultPath: config().pasta, properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return estado();
    salvarConfig({ pasta: r.filePaths[0] }); await ligar(); return estado();
  });
  ipcMain.handle('comandos', async (_e, ligarComandos) => {
    if (ligarComandos) {
      const r = await dialog.showMessageBox(janela, { type: 'warning', buttons: ['Permitir comandos', 'Cancelar'], defaultId: 1, cancelId: 1, title: 'Permitir comandos?',
        message: 'Deixar os agentes rodarem comandos neste computador?',
        detail: 'Cada comando só roda depois que você aprovar em Sua mesa, no site. Um comando aprovado pode alcançar qualquer lugar que a sua conta do Windows alcança, não só a pasta escolhida. Leia sempre o comando antes de aprovar.' });
      if (r.response !== 0) return estado();
    }
    salvarConfig({ comandos: ligarComandos }); await ligar(); return estado();
  });
  ipcMain.handle('iniciar-com-windows', (_e, v) => { salvarConfig({ iniciarComWindows: v }); aplicarInicio(); return estado(); });
  ipcMain.handle('pausar', async (_e, p) => { await alternarPausa(p); return estado(); });
  ipcMain.handle('abrir-pasta', () => shell.openPath(config().pasta));
  ipcMain.handle('abrir-site', () => shell.openExternal(SITE));
  ipcMain.handle('sair', async () => {
    await conector?.desligar(); await supabase?.auth.signOut().catch(() => {});
    try { fs.unlinkSync(ARQ_SESSAO()); } catch { /* já não havia sessão */ }
    email = ''; log.length = 0; enviarEstado(); return estado();
  });
}

function aplicarInicio() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: config().iniciarComWindows, args: ['--oculto'] });
}

async function iniciar() {
  registrarIpc();
  bandeja = new Tray(nativeImage.createFromPath(path.join(aqui, 'bandeja.png')));
  bandeja.on('click', mostrar);
  enviarEstado();
  try {
    await garantirCliente();
    const { data } = await supabase.auth.getUser();
    if (data?.user) { email = data.user.email ?? ''; await ligar(); }
  } catch (e) { erro = e.message; }
  aplicarInicio();
  enviarEstado();
  const oculto = process.argv.includes('--oculto');
  if (!oculto || !email) mostrar();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', mostrar);
  app.on('window-all-closed', () => { /* continua na bandeja */ });
  app.on('before-quit', () => { app.isQuitting = true; void conector?.desligar(); });
  app.whenReady().then(iniciar);
}
