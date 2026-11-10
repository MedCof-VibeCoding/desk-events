import { falha, json, preflight, usuario, HttpError } from '../lib/core.js';
import { configurado, listarModelos, provedorValido } from '../lib/providers.js';

export const OPTIONS = () => preflight();

// GET /api/models?provedor=openai — lista os modelos de texto da conta daquele provedor.
export async function GET(request: Request): Promise<Response> {
  try {
    await usuario(request);
    const p = new URL(request.url).searchParams.get('provedor');
    if (!provedorValido(p)) throw new HttpError(400, 'Provedor desconhecido.');
    if (!configurado(p)) return json({ configurado: false, modelos: [] });
    return json({ configurado: true, modelos: await listarModelos(p) });
  } catch (e) { return falha(e); }
}
