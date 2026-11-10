#!/usr/bin/env node
// Ponte local do Escritório de Agentes.
// Uso: npm run ponte            (pasta padrão: Documentos/Agentes)
//      npm run ponte -- "C:\caminho\da\pasta"
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { executar } from './arquivos.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const SESSAO = path.join(os.homedir(), '.desk-events-ponte.json');

function lerEnv() {
  const arq = path.join(aqui, '..', 'desktop', '.env');
  if (!fss.existsSync(arq)) { console.error('Não achei apps/desktop/.env. Crie esse arquivo com a URL e a chave pública do Supabase.'); process.exit(1); }
  const env = {};
  for (const l of fss.readFileSync(arq, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) { console.error('O arquivo apps/desktop/.env está sem VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY.'); process.exit(1); }
  return env;
}

function perguntar(texto, oculto = false) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) rl._writeToOutput = s => { if (s.includes(texto)) rl.output.write(s); };
    rl.question(texto, r => { rl.close(); if (oculto) process.stdout.write('\n'); resolve(r.trim()); });
  });
}

// A sessão fica num arquivo na pasta do usuário, para não pedir a senha toda vez.
const guarda = {
  getItem: () => { try { return fss.readFileSync(SESSAO, 'utf8'); } catch { return null; } },
  setItem: (_k, v) => { fss.writeFileSync(SESSAO, v, { mode: 0o600 }); },
  removeItem: () => { try { fss.unlinkSync(SESSAO); } catch {} }
};

const env = lerEnv();
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { storage: guarda, storageKey: 'sessao', persistSession: true, autoRefreshToken: true } });
const hora = () => new Date().toLocaleTimeString('pt-BR');

async function entrar() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user;
  console.log('Entre com a mesma conta do escritório.');
  for (;;) {
    const email = await perguntar('E-mail: ');
    const senha = await perguntar('Senha: ', true);
    const r = await supabase.auth.signInWithPassword({ email, password: senha });
    if (r.data.user) return r.data.user;
    console.log('Não deu certo: ' + (r.error?.message === 'Invalid login credentials' ? 'e-mail ou senha incorretos.' : r.error?.message));
  }
}

async function principal() {
  if (process.argv.includes('--sair')) { await supabase.auth.signOut(); guarda.removeItem(); console.log('Sessão da ponte encerrada.'); return; }
  const raiz = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(os.homedir(), 'Documents', 'Agentes'));
  await fs.mkdir(raiz, { recursive: true });
  const user = await entrar();
  const { data: membro } = await supabase.from('membros').select('escritorio_id, papel').eq('user_id', user.id).limit(1).maybeSingle();
  if (!membro) { console.error('Esta conta ainda não participa de nenhum escritório.'); process.exit(1); }

  const bater = async () => {
    const { error } = await supabase.from('pontes').upsert({ user_id: user.id, escritorio_id: membro.escritorio_id, nome: os.hostname(), pasta: raiz, visto_em: new Date().toISOString() });
    if (error) console.error(`[${hora()}] Não consegui avisar o escritório: ${error.message}`);
  };
  await bater();
  setInterval(bater, 20_000);

  const emCurso = new Set();
  const atender = async () => {
    const { data: fila } = await supabase.from('tarefas_locais').select('id, ferramenta, args').eq('user_id', user.id).eq('estado', 'pendente').order('criado_em').limit(10);
    for (const t of fila ?? []) {
      if (emCurso.has(t.id)) continue;
      emCurso.add(t.id);
      const { data: peguei } = await supabase.from('tarefas_locais').update({ estado: 'executando' }).eq('id', t.id).eq('estado', 'pendente').select('id');
      if (!peguei?.length) { emCurso.delete(t.id); continue; }
      const alvo = t.args?.caminho ?? t.args?.pasta ?? '';
      try {
        const resultado = await executar(raiz, t.ferramenta, t.args);
        await supabase.from('tarefas_locais').update({ estado: 'feito', resultado }).eq('id', t.id);
        console.log(`[${hora()}] ${t.ferramenta} ${alvo} — feito`);
      } catch (e) {
        await supabase.from('tarefas_locais').update({ estado: 'erro', resultado: String(e.message || e).slice(0, 500) }).eq('id', t.id);
        console.log(`[${hora()}] ${t.ferramenta} ${alvo} — recusado: ${e.message}`);
      }
      emCurso.delete(t.id);
    }
  };
  supabase.channel('ponte').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tarefas_locais', filter: `user_id=eq.${user.id}` }, atender).subscribe();
  setInterval(atender, 3000);

  console.log(`\nPonte local ligada para ${user.email}.`);
  console.log(`Pasta de trabalho: ${raiz}`);
  console.log('Os agentes só enxergam o que está dentro dessa pasta. Deixe esta janela aberta; Ctrl + C desliga.\n');
  const sair = async () => { await supabase.from('pontes').delete().eq('user_id', user.id); process.exit(0); };
  process.on('SIGINT', sair); process.on('SIGTERM', sair);
}
principal().catch(e => { console.error(e.message || e); process.exit(1); });
