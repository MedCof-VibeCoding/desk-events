# desk-events — Escritório de Agentes

Aplicativo para Windows onde o time cria agentes de IA (Claude, ChatGPT e Gemini),
liga skills e ferramentas e acompanha o trabalho num escritório visual.

## Estrutura

| Pasta | O que é |
| --- | --- |
| `apps/desktop` | Aplicativo Electron + React: login, escritório e criação de agentes |
| `apps/server` | Servidor de agentes, publicado na Vercel (fase 1: só verificação) |
| `supabase/migrations` | Banco: tabelas, papéis e regras por linha |

## Rodar na sua máquina

Requer Node.js 20 ou mais novo.

```bash
npm install
copy apps\desktop\.env.example apps\desktop\.env   # depois preencha VITE_SUPABASE_ANON_KEY
npm run dev    # abre no navegador, para desenvolver
npm run app    # abre como aplicativo de desktop
npm run dist   # gera o instalador .exe em apps/desktop/release
```

A chave fica em Supabase > Project Settings > API (chave anon/publishable).

## Banco

As migrações `0001_base.sql` e `0002_realtime.sql` já foram aplicadas no projeto
Supabase. Mudanças novas entram como arquivos novos nesta pasta, em ordem.

## Vercel

O projeto da Vercel aponta para `apps/server` (Root Directory). Depois de publicado,
`/api/health` responde `{ "ok": true }`.

## Fases

1. Base compartilhada: login, papéis, escritório e agentes (esta entrega)
2. Os três modelos e o ciclo do agente no servidor
3. Skills e conexões (MCP e API HTTP)
4. Autonomia: níveis, tetos, aprovações, agenda
5. Acabamento: atualização automática, ponte local, relatório de custo
