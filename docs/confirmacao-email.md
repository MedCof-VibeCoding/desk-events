# Confirmação de e-mail

O envio atual usa SendGrid pelo Send Email Hook. Para ativar, siga [sendgrid.md](sendgrid.md). As instruções de template abaixo são apenas a alternativa sem hook.

## Implementação

O cadastro e o reenvio informam `/confirmar-email` como destino. A página aceita o token hash do e-mail personalizado, o retorno com sessão do e-mail padrão e o código PKCE. O SDK não consome automaticamente os parâmetros nessa rota: a página controla uma única verificação, remove credenciais da URL e só apresenta sucesso após validar o usuário com o servidor. Erros, links ausentes, expirados e reenvio têm telas próprias. Não há navegação para destinos fornecidos na URL.

## Ativação em produção (pendente)

1. Publicar o frontend. `apps/desktop/vercel.json` permite acesso direto à rota.
2. No projeto Supabase, em Authentication → URL Configuration, definir Site URL como `https://desk-events.vercel.app` (sem barra final).
3. Adicionar `https://desk-events.vercel.app/confirmar-email` aos Redirect URLs. Para desenvolvimento, cadastrar também o endereço local usado, com o mesmo caminho.
4. Em Authentication → Email Templates → Confirm signup, usar o assunto `Confirme seu e-mail — Desk Events` e substituir o corpo por `supabase/templates/confirmar-email.html`.
5. Testar com uma nova conta: cadastro, abertura do e-mail, confirmação, entrada no escritório e reutilização de link. Testar também o reenvio com um cadastro ainda não confirmado.

O modelo personalizado usa Site URL: envia o usuário diretamente para o domínio de produção, inclusive se o cadastro ocorrer em uma prévia. Use outro projeto de autenticação para testar templates em desenvolvimento. A confirmação permanece habilitada.

Sem o passo 4, o link ainda passa pelo endpoint do Supabase, embora o destino final seja a nova página. Links de e-mails antigos não podem ser alterados; solicitar um novo e-mail após atualizar o template.

Referências: https://supabase.com/docs/guides/auth/auth-email-templates e https://supabase.com/docs/guides/auth/redirect-urls.
