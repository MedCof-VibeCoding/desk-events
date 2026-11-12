import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// base './' para o Electron carregar os arquivos direto do disco.
// conector-config.json: o DeskCof Conector lê daqui o endereço e a chave pública do banco,
// então nada disso precisa ficar no código do Conector.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: './',
    build: { outDir: 'dist' },
    plugins: [react(), {
      name: 'conector-config',
      generateBundle() {
        if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) return;
        this.emitFile({ type: 'asset', fileName: 'conector-config.json', source: JSON.stringify({ supabaseUrl: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY }) });
      }
    }]
  };
});
