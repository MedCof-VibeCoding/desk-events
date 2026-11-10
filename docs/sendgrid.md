# SendGrid — e-mails de autenticação

O SendGrid envia os e-mails. O Supabase mantém cadastro, senha, tokens de uso único, expiração e limites de reenvio. O frontend continua usando `signUp` e `resend`; o Send Email Hook chama o servidor automaticamente. Não há envio adicional pelo navegador, evitando duplicar mensagens.

## Variáveis no projeto Vercel do servidor

Projeto: `desk-events-server`, Root Directory `apps/server`. As variáveis no projeto do frontend não são compartilhadas com o servidor.

| Variável | Valor |
| --- | --- |
| `SENDGRID_API_KEY` | Chave privada com permissão Mail Send |
| `SENDGRID_FROM_EMAIL` | `nao-responda@grupomedcof.com.br` — remetente escolhido; validar identidade no SendGrid |
| `SENDGRID_FROM_NAME` | `Desk Events` (padrão) |
| `SEND_EMAIL_HOOK_SECRET` | Segredo gerado no Supabase para assinar o hook, formato `v1,whsec_...` |
| `APP_URL` | `https://desk-events.vercel.app` |
| `SUPABASE_URL` | URL do projeto de autenticação, já usada pelo servidor |

Não colocar segredos em variáveis `VITE_*`. O endpoint não precisa da service role para enviar: recebe o token do próprio Supabase em uma requisição assinada.

## Ativação pendente

1. Confirmar o remetente em SendGrid → Sender Authentication. Informar `SENDGRID_FROM_EMAIL` no servidor.
2. Em Supabase → Authentication → Hooks, criar um **Send Email Hook (HTTPS)** para `https://desk-events-server.vercel.app/api/auth-email`. Copiar o segredo gerado para `SEND_EMAIL_HOOK_SECRET` no servidor. Não ativar antes de publicar o endpoint configurado.
3. Publicar o servidor e o frontend; depois habilitar o hook. Manter o provedor Email e a confirmação de e-mail habilitados no Supabase.
4. Manter Site URL `https://desk-events.vercel.app` e permitir o Redirect URL `https://desk-events.vercel.app/confirmar-email`.
5. Fazer um cadastro de teste autorizado e conferir a mensagem no SendGrid Email Activity, a chegada à caixa de entrada, a confirmação no Desk Events e o reenvio. HTTP 202 significa aceito pelo SendGrid, não entregue.

O hook substitui o envio SMTP do Supabase. O template de cadastro agora está no código do servidor (`apps/server/lib/auth-email.ts`), com HTML preto/vermelho e alternativa em texto. Não precisa cadastrar template no SendGrid ou alterar o template do painel Supabase. O arquivo anterior em `supabase/templates` fica apenas como alternativa caso o hook seja desativado.

## Comportamento

- Cadastro e reenvio abrem diretamente `/confirmar-email?token_hash=...&type=email` no domínio de `APP_URL`.
- Rastreamento de clique e abertura é desabilitado para preservar os links de autenticação.
- Recuperação, convite, magic link, reautenticação e alteração de e-mail também têm mensagens. Os links desses outros fluxos mantêm o endpoint de verificação do Supabase e aceitam retorno apenas para a origem do aplicativo. Esta integração não acrescenta telas de recuperação ou convite ao frontend.
- Alteração segura de e-mail usa os dois destinatários e os hashes correspondentes, conforme o contrato do Supabase.
- Tipos desconhecidos são rejeitados, sem indicar envio bem-sucedido. Novas notificações de segurança devem ganhar um template antes de serem habilitadas no provedor.
- O hook exige assinatura HMAC-SHA256 Standard Webhooks com tolerância de cinco minutos; rejeita corpos maiores que 64 KiB. Nunca recebe conteúdo de e-mail livre do navegador.
- Cada chamada ao SendGrid tem limite de 3,5 segundos. Não há retentativas internas que ultrapassem o prazo do hook. Em falha, o cadastro/reenvio recebe erro e pode ser tentado novamente. Repetições de uma chamada assinada podem reenviar a mesma mensagem; não há deduplicação persistente entre instâncias.
- Logs contêm somente códigos de falha, sem chaves, tokens ou destinatários.

## Validação

`npm run typecheck`

`node --test tests/sendgrid.test.mjs tests/confirmacao-email.test.mjs tests/workspace.test.mjs`

Os testes simulam o provedor e não enviam mensagens reais.

Fontes: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook ; https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send ; https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md
