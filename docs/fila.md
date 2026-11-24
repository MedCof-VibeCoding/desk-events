# Fila dos agentes em segundo plano

O site não espera mais o agente terminar. `/api/run` e `/api/decidir` respondem na hora e o
trabalho continua no servidor; o site acompanha a ficha ao vivo pelo banco.

## Como funciona

- **Reserva.** `pegar_fichas` marca a ficha como `trabalhando` por 5 minutos. Só uma execução
  mexe nela por vez. Se o servidor cair, a reserva vence e a ficha é pega de novo sozinha.
- **Prazo.** Cada execução trabalha por até 3 minutos (a Vercel corta em 5). Depois disso a
  ficha volta para a fila num ponto seguro e o servidor acorda outra execução, que continua
  de onde parou. Uma ficha retomada 50 vezes para com erro, para não ficar em laço.
- **Computador.** O pedido para a ponte local espera 15 s. Sem resposta, a ficha passa para
  `aguardando_computador` e o servidor fica livre. Quando a ponte responde, um gatilho no banco
  devolve a ficha para a fila e acorda o servidor. Pedido sem resposta em 10 minutos vira erro.
- **Despertador.** O banco chama `POST /api/fila` a cada minuto (pg_cron + pg_net). É ele que
  faz as fichas andarem com o site e os computadores de todo mundo desligados.

## Configurar (uma vez)

1. Na Vercel, projeto do servidor, crie a variável `CRON_SECRET` com um valor longo e aleatório
   (por exemplo, o resultado de `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
2. Rode `npm install` na raiz, para instalar `@vercel/functions` e atualizar o `package-lock.json`.
3. No SQL Editor do Supabase, rode `supabase/migrations/0010_fila_em_segundo_plano.sql`.
4. Ainda no SQL Editor, abra `supabase/configurar_fila.sql`, troque o endereço do servidor e o
   segredo pelo mesmo `CRON_SECRET`, e rode. Não salve o arquivo com o segredo preenchido.
5. Publique o servidor e o site.

Para conferir: `select * from cron.job_run_details order by start_time desc limit 5;` deve
mostrar execuções com sucesso a cada minuto.

Sem o passo 4 tudo continua funcionando, mas fichas longas, retomadas depois do computador e
fichas presas só andam quando alguém abre a ficha e manda tentar de novo.
