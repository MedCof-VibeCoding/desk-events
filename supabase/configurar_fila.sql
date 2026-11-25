-- Configuração única da fila dos agentes. Rode no SQL Editor do Supabase DEPOIS da
-- migração 0010. Troque os dois valores marcados antes de rodar. Não versione este
-- arquivo com o segredo preenchido.
--
-- O que isto faz: a cada minuto, e sempre que a ponte local responde, o banco chama
-- o servidor de agentes (POST /api/fila). Assim as fichas andam mesmo com o site e o
-- computador de todo mundo desligados.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 1. Endereço do servidor de agentes (o domínio de produção do projeto da Vercel, não o do site).
select vault.create_secret('https://TROQUE-PELO-SERVIDOR.vercel.app/api/fila', 'deskcof_fila_url');
-- 2. O mesmo valor da variável CRON_SECRET cadastrada na Vercel.
select vault.create_secret('TROQUE-PELO-CRON_SECRET', 'deskcof_fila_segredo');

-- Despertador de 1 em 1 minuto.
select cron.schedule('deskcof-fila', '* * * * *', $$select public.acordar_fila()$$);

-- Despertador das tarefas programadas (migração 0011): a cada minuto cria as fichas das agendas que venceram.
select cron.schedule('deskcof-agendas', '* * * * *', $$select public.executar_agendas()$$);

-- Para conferir: select * from cron.job_run_details order by start_time desc limit 5;
-- Para trocar um valor: select vault.update_secret((select id from vault.secrets where name = 'deskcof_fila_url'), 'https://novo/api/fila');
