// Execução de comandos da ponte local. Desligada por padrão: só funciona se a ponte
// for iniciada com --comandos. Cada comando já chega aqui aprovado no site pelo dono do computador.
import { spawn } from 'node:child_process';

const TEMPO = 40_000, MAX_SAIDA = 20_000;
// Segunda barreira, além da aprovação: recusa o que costuma ser destrutivo. Não é uma lista completa.
const PERIGOSO = [
  /\bformat\s+[a-z]:/i, /\bdiskpart\b/i, /\bmkfs/i, /\bdd\s+if=/i, /\bshutdown\b/i, /\breboot\b/i,
  /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)[a-z]*\s+(\/|~|\$HOME|[a-z]:\\?)\s*$/i, /\brd\s+\/s/i, /\brmdir\s+\/s/i, /\bdel\s+.*\/s/i,
  /\breg\s+(delete|add)\b/i, /\bnet\s+user\b/i, /\bcipher\s+\/w/i, /\bvssadmin\b/i, /\bbcdedit\b/i, /:\(\)\s*\{.*\};\s*:/
];

export function rodar(raiz, comando, { habilitado }) {
  return new Promise((resolve, reject) => {
    if (!habilitado) return reject(new Error('Esta ponte foi ligada sem permissão para comandos. Para permitir, a pessoa precisa ligar com: npm run ponte -- --comandos'));
    const texto = String(comando ?? '').trim();
    if (!texto) return reject(new Error('Comando vazio.'));
    if (texto.length > 2000) return reject(new Error('Comando longo demais.'));
    if (PERIGOSO.some(r => r.test(texto))) return reject(new Error('A ponte recusa esse tipo de comando por ser destrutivo.'));
    const filho = spawn(texto, { cwd: raiz, shell: true, windowsHide: true });
    let saida = '', cortada = false, estourou = false;
    const junta = d => { if (saida.length < MAX_SAIDA) saida += d.toString('utf8'); else cortada = true; };
    filho.stdout.on('data', junta); filho.stderr.on('data', junta);
    const relogio = setTimeout(() => { estourou = true; filho.kill(); }, TEMPO);
    filho.on('error', e => { clearTimeout(relogio); reject(new Error('Não foi possível iniciar o comando: ' + e.message)); });
    filho.on('close', codigo => {
      clearTimeout(relogio);
      const corpo = saida.slice(0, MAX_SAIDA).trim() || '(sem saída)';
      const rodape = estourou ? `\n[interrompido: passou de ${TEMPO / 1000} segundos]` : cortada ? '\n[saída cortada]' : '';
      resolve(`Código de saída: ${estourou ? 'interrompido' : codigo}\n${corpo}${rodape}`);
    });
  });
}
