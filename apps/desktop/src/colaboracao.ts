export function erroColaboracao(error: { code?: string; message: string }): string {
  if (['42P01', 'PGRST205'].includes(error.code ?? '')) return 'Este recurso ainda não foi ativado no escritório. A atualização do banco de dados está pendente.';
  return error.message;
}
export function linkReuniao(valor: string): string | null {
  try {
    const url = new URL(valor.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
