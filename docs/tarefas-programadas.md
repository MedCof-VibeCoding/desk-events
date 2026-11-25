# Tarefas programadas

Uma tarefa programada manda a mesma tarefa a um agente de tempos em tempos: a cada X minutos, todo dia, em dias da semana ou uma vez por mês. Fica em **Tarefas programadas**, no menu do escritório. Quem é editor cria, edita, pausa e exclui; quem é operador pode usar "Rodar agora".

## Ativar (uma vez)

1. Rode `supabase/migrations/0011_tarefas_programadas.sql` no SQL Editor do Supabase.
2. Rode de novo `supabase/configurar_fila.sql` (ele cria o despertador `deskcof-agendas`, a cada minuto). Se o despertador da fila já estava configurado, basta rodar a linha `cron.schedule('deskcof-agendas', ...)`.

Sem o passo 2 as agendas só disparam quando o servidor de agentes for acordado, então configure o despertador.

## Como a consistência é garantida

- **Sem duplicar:** cada ocorrência (agenda + horário previsto) é gravada uma única vez em `agendas_execucoes`. Duas execuções ao mesmo tempo nunca criam duas fichas.
- **Sem depender do site:** quem dispara é o banco (pg_cron). O servidor de agentes também chama `executar_agendas` ao ser acordado, como rede de segurança.
- **Recuperação:** se o sistema ficar fora do ar, a ocorrência atrasada roda assim que voltar, desde que dentro da tolerância da agenda (padrão: 2 horas). Passou disso, vira "Pulada" no histórico e o calendário segue.
- **Sem acúmulo:** se a execução anterior ainda não terminou, a nova é pulada (pode ser desligado).
- **Continuidade:** cada execução recebe o resultado da anterior como contexto, marcado como informação e não como ordem (pode ser desligado).
- **Horário certo:** dias e horas seguem o fuso escolhido, inclusive horário de verão. Dia 31 em mês curto roda no último dia. "A cada X minutos" segue uma grade fixa, sem deriva.
- **Proteções:** 5 execuções seguidas com erro pausam a agenda. Ela também para se quem a criou deixa de ser operador da sala. Sala pausada ou agente desativado pulam a ocorrência.
- **Segurança:** as fichas nascem com `origem = agenda` e seguem todas as regras de autonomia e aprovação do agente; comandos no computador continuam exigindo aprovação do dono do PC.

Testes: `tests/agendas.test.mjs`.
