// Ponte segura entre a janela e o programa: só estas funções ficam disponíveis.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('conector', {
  estado: () => ipcRenderer.invoke('estado'),
  entrar: (email, senha) => ipcRenderer.invoke('entrar', String(email), String(senha)),
  escolherPasta: () => ipcRenderer.invoke('escolher-pasta'),
  comandos: ligar => ipcRenderer.invoke('comandos', ligar === true),
  iniciarComWindows: ligar => ipcRenderer.invoke('iniciar-com-windows', ligar === true),
  pausar: pausado => ipcRenderer.invoke('pausar', pausado === true),
  abrirPasta: () => ipcRenderer.invoke('abrir-pasta'),
  abrirSite: () => ipcRenderer.invoke('abrir-site'),
  sair: () => ipcRenderer.invoke('sair'),
  aoMudar: fn => { const f = (_e, e) => fn(e); ipcRenderer.on('estado', f); return () => ipcRenderer.removeListener('estado', f); }
});
