import { HttpError } from './core.js';

export type Provedor = 'anthropic' | 'openai' | 'google';
export interface Chamada { id: string; nome: string; args: Record<string, unknown> }
// Mensagem neutra, igual para os três provedores. `bruto` guarda o formato original
// do provedor para ser devolvido sem alteração na conversa seguinte.
export type Msg =
  | { role: 'user'; texto: string }
  | { role: 'assistant'; texto: string; chamadas: Chamada[]; bruto?: unknown }
  | { role: 'tool'; id: string; nome: string; resultado: string };
export interface Ferramenta { nome: string; descricao: string; parametros: Record<string, unknown> }
export interface Resposta { texto: string; chamadas: Chamada[]; bruto: unknown; tokensEntrada: number; tokensSaida: number }
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
  if (!res.ok) throw new HttpError(502, `O ${NOME[p]} recusou a chamada: ${String(corpo?.error?.message || `código ${res.status}`).slice(0, 300)}`);
  return corpo;
}
const novoId = () => 'c_' + Math.random().toString(36).slice(2, 12);
const json = (s: unknown) => { try { return typeof s === 'string' ? JSON.parse(s) : (s ?? {}); } catch { return {}; } };

// Uma rodada de conversa com o modelo, com as ferramentas disponíveis.
export async function conversar(p: Provedor, modelo: string, sistema: string, msgs: Msg[], ferramentas: Ferramenta[], f: Fetch = fetch): Promise<Resposta> {
  const k = chave(p);
  if (p === 'openai') {
    const messages: any[] = [{ role: 'system', content: sistema }];
    for (const m of msgs) {
      if (m.role === 'user') messages.push({ role: 'user', content: m.texto });
      else if (m.role === 'tool') messages.push({ role: 'tool', tool_call_id: m.id, content: m.resultado });
      else messages.push(m.bruto ?? { role: 'assistant', content: m.texto || null, ...(m.chamadas.length ? { tool_calls: m.chamadas.map(c => ({ id: c.id, type: 'function', function: { name: c.nome, arguments: JSON.stringify(c.args) } })) } : {}) });
    }
    const body: any = { model: modelo, messages };
    if (ferramentas.length) body.tools = ferramentas.map(t => ({ type: 'function', function: { name: t.nome, description: t.descricao, parameters: t.parametros } }));
    const c = await chamar(p, f, 'https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${k}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const m = c.choices?.[0]?.message ?? {};
    const chamadas: Chamada[] = (m.tool_calls ?? []).filter((t: any) => t.type === 'function').map((t: any) => ({ id: t.id, nome: t.function?.name, args: json(t.function?.arguments) }));
    return { texto: m.content ?? '', chamadas, bruto: { role: 'assistant', content: m.content ?? null, ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}) }, tokensEntrada: c.usage?.prompt_tokens ?? 0, tokensSaida: c.usage?.completion_tokens ?? 0 };
  }
  if (p === 'google') {
    const contents: any[] = [];
    for (const m of msgs) {
      if (m.role === 'user') contents.push({ role: 'user', parts: [{ text: m.texto }] });
      else if (m.role === 'assistant') contents.push({ role: 'model', parts: (m.bruto as any[]) ?? [...(m.texto ? [{ text: m.texto }] : []), ...m.chamadas.map(c => ({ functionCall: { name: c.nome, args: c.args } }))] });
      else {
        const parte = { functionResponse: { name: m.nome, response: { result: m.resultado }, ...(m.id.startsWith('c_') ? {} : { id: m.id }) } };
        const ult = contents[contents.length - 1];
        if (ult?.role === 'user' && ult.parts[0]?.functionResponse) ult.parts.push(parte); else contents.push({ role: 'user', parts: [parte] });
      }
    }
    const body: any = { systemInstruction: { parts: [{ text: sistema }] }, contents };
    if (ferramentas.length) body.tools = [{ functionDeclarations: ferramentas.map(t => ({ name: t.nome, description: t.descricao, parameters: t.parametros })) }];
    const c = await chamar(p, f, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': k, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const partes: any[] = c.candidates?.[0]?.content?.parts ?? [];
    const chamadas: Chamada[] = partes.filter(x => x.functionCall).map(x => ({ id: x.functionCall.id ?? novoId(), nome: x.functionCall.name, args: x.functionCall.args ?? {} }));
    return { texto: partes.filter(x => !x.thought).map(x => x.text ?? '').join(''), chamadas, bruto: partes, tokensEntrada: c.usageMetadata?.promptTokenCount ?? 0, tokensSaida: c.usageMetadata?.candidatesTokenCount ?? 0 };
  }
  const messages: any[] = [];
  for (const m of msgs) {
    if (m.role === 'user') messages.push({ role: 'user', content: m.texto });
    else if (m.role === 'assistant') messages.push({ role: 'assistant', content: m.bruto ?? [...(m.texto ? [{ type: 'text', text: m.texto }] : []), ...m.chamadas.map(c => ({ type: 'tool_use', id: c.id, name: c.nome, input: c.args }))] });
    else {
      const bloco = { type: 'tool_result', tool_use_id: m.id, content: m.resultado };
      const ult = messages[messages.length - 1];
      if (ult?.role === 'user' && Array.isArray(ult.content) && ult.content[0]?.type === 'tool_result') ult.content.push(bloco); else messages.push({ role: 'user', content: [bloco] });
    }
  }
  const body: any = { model: modelo, max_tokens: 4096, system: sistema, messages };
  if (ferramentas.length) body.tools = ferramentas.map(t => ({ name: t.nome, description: t.descricao, input_schema: t.parametros }));
  const c = await chamar(p, f, 'https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const blocos: any[] = c.content ?? [];
  return { texto: blocos.filter(b => b.type === 'text').map(b => b.text).join(''), chamadas: blocos.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, nome: b.name, args: b.input ?? {} })), bruto: blocos, tokensEntrada: c.usage?.input_tokens ?? 0, tokensSaida: c.usage?.output_tokens ?? 0 };
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
    ids = (c.models ?? []).filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent')).map((m: any) => String(m.name).replace(/^models\//, '')).filter((id: string) => id.startsWith('gemini'));
  } else {
    const c = await chamar(p, f, 'https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01' } });
    ids = (c.data ?? []).map((m: any) => String(m.id));
  }
  return [...new Set(ids.filter(id => !FORA.test(id)))].sort();
}
