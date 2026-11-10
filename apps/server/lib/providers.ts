import { HttpError } from './core.js';

export type Provedor = 'anthropic' | 'openai' | 'google';
export interface Resposta { texto: string; tokensEntrada: number; tokensSaida: number }
type Fetch = typeof fetch;

const ENV: Record<Provedor, string> = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', google: 'GEMINI_API_KEY' };
const NOME: Record<Provedor, string> = { anthropic: 'Claude', openai: 'ChatGPT', google: 'Gemini' };

export const provedorValido = (p: unknown): p is Provedor => p === 'anthropic' || p === 'openai' || p === 'google';
export const configurado = (p: Provedor) => Boolean(process.env[ENV[p]]);

function chave(p: Provedor): string {
  const k = process.env[ENV[p]];
  if (!k) throw new HttpError(400, `A chave de API do ${NOME[p]} ainda não foi configurada no servidor.`);
  return k;
}

async function chamar(p: Provedor, f: Fetch, url: string, init: RequestInit): Promise<any> {
  let res: Response;
  try { res = await f(url, init); } catch { throw new HttpError(502, `Não foi possível falar com o ${NOME[p]}.`); }
  const corpo: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const motivo = corpo?.error?.message || `código ${res.status}`;
    throw new HttpError(502, `O ${NOME[p]} recusou a chamada: ${String(motivo).slice(0, 300)}`);
  }
  return corpo;
}

// Uma resposta do modelo para um pedido, com as instruções do agente como sistema.
export async function gerar(p: Provedor, modelo: string, sistema: string, pedido: string, f: Fetch = fetch): Promise<Resposta> {
  const k = chave(p);
  if (p === 'openai') {
    const c = await chamar(p, f, 'https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { authorization: `Bearer ${k}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: modelo, messages: [{ role: 'system', content: sistema }, { role: 'user', content: pedido }] })
    });
    return { texto: c.choices?.[0]?.message?.content ?? '', tokensEntrada: c.usage?.prompt_tokens ?? 0, tokensSaida: c.usage?.completion_tokens ?? 0 };
  }
  if (p === 'google') {
    const c = await chamar(p, f, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: 'POST', headers: { 'x-goog-api-key': k, 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: 'user', parts: [{ text: pedido }] }] })
    });
    const partes: any[] = c.candidates?.[0]?.content?.parts ?? [];
    return { texto: partes.map(x => x.text ?? '').join(''), tokensEntrada: c.usageMetadata?.promptTokenCount ?? 0, tokensSaida: c.usageMetadata?.candidatesTokenCount ?? 0 };
  }
  const c = await chamar(p, f, 'https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: modelo, max_tokens: 4096, system: sistema, messages: [{ role: 'user', content: pedido }] })
  });
  const blocos: any[] = c.content ?? [];
  return { texto: blocos.filter(b => b.type === 'text').map(b => b.text).join(''), tokensEntrada: c.usage?.input_tokens ?? 0, tokensSaida: c.usage?.output_tokens ?? 0 };
}

const FORA = /embed|audio|tts|image|realtime|transcribe|moderation|whisper|dall|search|instruct|vision|aqa|imagen|veo|robotics|computer-use|live/i;

// Modelos de texto disponíveis na conta, para o formulário mostrar em lista.
export async function listarModelos(p: Provedor, f: Fetch = fetch): Promise<string[]> {
  const k = chave(p);
  let ids: string[];
  if (p === 'openai') {
    const c = await chamar(p, f, 'https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${k}` } });
    ids = (c.data ?? []).map((m: any) => String(m.id)).filter((id: string) => /^(gpt|o\d|chatgpt)/.test(id));
  } else if (p === 'google') {
    const c = await chamar(p, f, 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': k } });
    ids = (c.models ?? []).filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m: any) => String(m.name).replace(/^models\//, '')).filter((id: string) => id.startsWith('gemini'));
  } else {
    const c = await chamar(p, f, 'https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01' } });
    ids = (c.data ?? []).map((m: any) => String(m.id));
  }
  return [...new Set(ids.filter(id => !FORA.test(id)))].sort();
}
