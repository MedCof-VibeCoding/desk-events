import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' para o Electron carregar os arquivos direto do disco.
export default defineConfig({ base: './', plugins: [react()], build: { outDir: 'dist' } });
