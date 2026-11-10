// Fase 1: só confirma que o projeto do servidor de agentes está publicado.
// O ciclo dos agentes (Vercel Workflow) entra na fase 2.
export function GET(): Response {
  return Response.json({ ok: true, servico: 'desk-events-server', fase: 1, hora: new Date().toISOString() });
}
