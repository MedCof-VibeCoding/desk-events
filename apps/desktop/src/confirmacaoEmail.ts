import type { SupabaseClient } from '@supabase/supabase-js';

export const CAMINHO_CONFIRMACAO = '/confirmar-email';
export const urlConfirmacao = (origem: string) => new URL(CAMINHO_CONFIRMACAO, origem).href;
export function ehPaginaConfirmacao(endereco: string) {
  const url = new URL(endereco), hash = new URLSearchParams(url.hash.slice(1));
  return url.pathname.replace(/\/$/, '') === CAMINHO_CONFIRMACAO || (url.pathname === '/' &&
    (url.searchParams.has('token_hash') || ['signup', 'email'].includes(hash.get('type') ?? '') || hash.has('error')));
}
export type LinkConfirmacao =
  | { modo: 'token'; token_hash: string; type: 'signup' | 'email' }
  | { modo: 'sessao'; access_token: string; refresh_token: string }
  | { modo: 'codigo'; code: string }
  | { modo: 'erro'; codigo: string }
  | { modo: 'ausente' };
export function lerLinkConfirmacao(endereco: string): LinkConfirmacao {
  const url = new URL(endereco), query = url.searchParams, hash = new URLSearchParams(url.hash.slice(1));
  if (query.has('error') || hash.has('error') || query.has('error_code') || hash.has('error_code'))
    return { modo: 'erro', codigo: query.get('error_code') ?? hash.get('error_code') ?? 'link_invalido' };
  const tipo = query.get('type') ?? hash.get('type');
  if (tipo && tipo !== 'email' && tipo !== 'signup') return { modo: 'erro', codigo: 'tipo_invalido' };
  const token = query.get('token_hash');
  if (token) return { modo: 'token', token_hash: token, type: tipo === 'signup' ? 'signup' : 'email' };
  const access_token = hash.get('access_token'), refresh_token = hash.get('refresh_token');
  if (access_token && refresh_token) return { modo: 'sessao', access_token, refresh_token };
  if (query.get('code')) return { modo: 'codigo', code: query.get('code')! };
  if (access_token || refresh_token || query.has('token_hash')) return { modo: 'erro', codigo: 'link_invalido' };
  return { modo: 'ausente' };
}
export function mensagemConfirmacao(erro: { code?: string; status?: number } | null) {
  if (erro?.status === 429 || erro?.code === 'over_email_send_rate_limit' || erro?.code === 'over_request_rate_limit')
    return 'Muitas tentativas. Aguarde um minuto antes de tentar novamente.';
  if (erro?.status === 0 || (erro?.status ?? 0) >= 500)
    return 'Não foi possível conectar agora. Confira sua conexão e tente novamente.';
  return 'Este link é inválido, já foi utilizado ou expirou. Entre na sua conta ou solicite um novo e-mail abaixo.';
}
type AuthConfirmacao = Pick<SupabaseClient['auth'], 'verifyOtp' | 'setSession' | 'exchangeCodeForSession' | 'getUser'>;
export type ResultadoConfirmacao = { estado: 'sucesso' | 'erro' | 'aguardando'; mensagem?: string };
export async function confirmarEmail(auth: AuthConfirmacao, link: LinkConfirmacao): Promise<ResultadoConfirmacao> {
  if (link.modo === 'ausente') return { estado: 'aguardando' };
  if (link.modo === 'erro') return { estado: 'erro', mensagem: mensagemConfirmacao({ code: link.codigo }) };
  try {
    const resultado = link.modo === 'token'
      ? await auth.verifyOtp({ token_hash: link.token_hash, type: link.type })
      : link.modo === 'sessao'
        ? await auth.setSession({ access_token: link.access_token, refresh_token: link.refresh_token })
        : await auth.exchangeCodeForSession(link.code);
    if (resultado.error) return { estado: 'erro', mensagem: mensagemConfirmacao(resultado.error) };
    const { data, error } = await auth.getUser();
    if (error || !data.user?.email_confirmed_at) return { estado: 'erro', mensagem: mensagemConfirmacao(error) };
    return { estado: 'sucesso' };
  } catch { return { estado: 'erro', mensagem: 'Não foi possível conectar agora. Confira sua conexão e solicite um novo link.' }; }
}
