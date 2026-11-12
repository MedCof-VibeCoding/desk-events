// Usa no Conector as mesmas regras de arquivo e de comando da ponte do terminal.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const aqui = path.dirname(fileURLToPath(import.meta.url));
const origem = path.join(aqui, '..', '..', 'bridge'), destino = path.join(aqui, '..', 'src', 'ponte');
fs.mkdirSync(destino, { recursive: true });
for (const f of ['arquivos.mjs', 'comandos.mjs']) fs.copyFileSync(path.join(origem, f), path.join(destino, f));
console.log('Regras da ponte copiadas para src/ponte.');
