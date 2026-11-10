import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// O aplicativo roda fora do navegador (Electron), então a origem varia; a proteção é o login.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type'
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS } });
export const preflight = () => new Response(null, { status: 204, headers: CORS });
export const falha = (e: unknown) => {
  if (e instanceof HttpError) return json({ erro: e.message }, e.status);
  console.error(e);
  return json({ erro: 'Erro inesperado no servidor de agentes.' }, 500);
};

let cliente: SupabaseClient | null = null;
// Cliente com a chave secreta: ignora as regras por linha. Só o servidor usa.
export function admin(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(500, 'O servidor está sem SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.');
  cliente = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cliente;
}

export async function usuario(request: Request): Promise<User> {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Faça login para continuar.');
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sessão inválida. Entre de novo.');
  return data.user;
}

const ORDEM = ['leitor', 'operador', 'editor', 'dono'];
export async function exigirPapel(userId: string, escritorioId: string, minimo: string): Promise<void> {
  const { data } = await admin().from('membros').select('papel').eq('escritorio_id', escritorioId).eq('user_id', userId).maybeSingle();
  if (!data || ORDEM.indexOf(data.papel) < ORDEM.indexOf(minimo)) throw new HttpError(403, 'Seu papel neste escritório não permite essa ação.');
}
