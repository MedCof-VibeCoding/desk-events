import { admin, exigirPapel, falha, json, preflight, usuario, HttpError } from '../lib/core.js';
import { gerar, provedorValido } from '../lib/providers.js';

export const OPTIONS = () => preflight();

// POST /api/run { fichaId } — o agente da ficha lê o pedido e entrega a resposta.
// Fase 2: uma resposta por ficha, sem ferramentas. O ciclo com ferramentas entra na fase 4.
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await usuario(request);
    const { fichaId } = (await request.json().catch(() => ({}))) as { fichaId?: string };
    if (!fichaId) throw new HttpError(400, 'Faltou informar a ficha.');
    const db = admin();

    const { data: ficha } = await db.from('fichas').select('id, escritorio_id, pedido, estado, agente_atual').eq('id', fichaId).maybeSingle();
    if (!ficha) throw new HttpError(404, 'Ficha não encontrada.');
    await exigirPapel(user.id, ficha.escritorio_id, 'operador');
    if (!ficha.agente_atual) throw new HttpError(400, 'A ficha não está com nenhum agente.');

    const { data: esc } = await db.from('escritorios').select('pausado').eq('id', ficha.escritorio_id).single();
    if (esc?.pausado) throw new HttpError(409, 'O escritório está pausado.');
    const { data: agente } = await db.from('agentes').select('id, nome, cargo, instrucoes, provedor, modelo, ativo').eq('id', ficha.agente_atual).maybeSingle();
    if (!agente || !agente.ativo) throw new HttpError(400, 'O agente desta ficha não existe ou está desativado.');
    if (!provedorValido(agente.provedor)) throw new HttpError(400, 'Provedor do agente inválido.');

    // Só uma execução por ficha: quem conseguir tirar da fila é quem trabalha.
    const { data: pega } = await db.from('fichas').update({ estado: 'trabalhando' }).eq('id', ficha.id).eq('estado', 'fila').select('id');
    if (!pega?.length) throw new HttpError(409, 'Esta ficha já está sendo trabalhada ou foi concluída.');

    const sistema = [
      `Você é ${agente.nome}, um agente de IA de um escritório de agentes.`,
      agente.cargo ? `Seu cargo: ${agente.cargo}` : '',
      agente.instrucoes ? `Suas instruções:\n${agente.instrucoes}` : '',
      'Responda em português do Brasil, de forma direta. Você ainda não tem ferramentas: trabalhe só com o que está no pedido e diga o que precisaria ser verificado.'
    ].filter(Boolean).join('\n\n');

    try {
      const r = await gerar(agente.provedor, agente.modelo, sistema, ficha.pedido);
      const texto = r.texto.trim() || '(O modelo não devolveu texto.)';
      await db.from('passos').insert({ ficha_id: ficha.id, escritorio_id: ficha.escritorio_id, agente_id: agente.id, tipo: 'mensagem', conteudo: { texto }, tokens_entrada: r.tokensEntrada, tokens_saida: r.tokensSaida });
      await db.from('fichas').update({ estado: 'entregue', resultado: texto }).eq('id', ficha.id);
      return json({ ok: true, estado: 'entregue' });
    } catch (e) {
      const motivo = e instanceof HttpError ? e.message : 'Erro inesperado ao chamar o modelo.';
      await db.from('passos').insert({ ficha_id: ficha.id, escritorio_id: ficha.escritorio_id, agente_id: agente.id, tipo: 'sistema', conteudo: { erro: motivo } });
      await db.from('fichas').update({ estado: 'erro', resultado: motivo }).eq('id', ficha.id);
      throw e;
    }
  } catch (e) { return falha(e); }
}
