import { app, BrowserWindow, Menu, Tray, nativeImage, shell } from 'electron';
import path from 'node:path';

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 780, minWidth: 900, minHeight: 600,
    title: 'Escritório de Agentes', backgroundColor: '#141927', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  const dev = process.env.VITE_DEV_SERVER_URL;
  if (dev) win.loadURL(dev); else win.loadFile(path.join(__dirname, '../dist/index.html'));
  // Links externos abrem no navegador, nunca dentro do aplicativo.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  // Fechar a janela mantém o aplicativo na bandeja, para receber aprovações.
  win.on('close', e => { if (!quitting) { e.preventDefault(); win?.hide(); } });
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('Escritório de Agentes');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir o escritório', click: () => { win?.show(); win?.focus(); } },
    { type: 'separator' },
    { label: 'Sair', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', () => { win?.show(); win?.focus(); });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { win?.show(); win?.focus(); });
  app.whenReady().then(() => { createWindow(); createTray(); });
  app.on('before-quit', () => { quitting = true; });
}
