# Usuários, salas, café e Google Agenda

## Ativar a atualização do banco

O projeto Supabase atual ainda não possui as tabelas de colaboração, perfis, presença e Google. O erro `PGRST205` na criação do avatar é causado por essa atualização pendente.

1. Abra o SQL Editor do projeto Supabase do Desk Events.
2. Execute **todo** o arquivo `supabase/atualizar_usuarios_salas.sql`. Ele reúne as migrações 0004, 0005 e 0006 em uma transação. Deve ser executado uma única vez, após as migrações 0001 a 0003.
3. Aguarde a confirmação de sucesso e clique em **Tentar novamente** na página do aplicativo.
4. Salve nome e avatar. A conta confirmada `uilian.sabadi@grupomedcof.com.br` será identificada como admin geral. Nenhuma senha é alterada.

Em outros ambientes, aplique apenas as migrações que ainda não foram executadas. Não execute o arquivo agregado se as migrações 0004–0006 já estiverem aplicadas. Um erro reverte a transação inteira; não há necessidade de apagar tabelas.

## Permissões

| Pessoa | Escritório principal | Sala privada sem associação | Sala própria |
| --- | --- | --- | --- |
| Usuário comum com avatar | Visitar, conversar, agendar reuniões | Sem acesso | Dono; pode criar agentes e conceder acesso |
| Admin geral | Dono do principal | Sem acesso automático | Dono |
| Visitante de uma sala | Ver agentes e pessoas, conversar e agendar | — | Não cria nem executa agentes |
| Operador | Executar tarefas dos agentes | — | Não cria agentes |
| Editor / dono | Criar e editar agentes | — | Sim |

O admin geral gerencia permissões somente de salas às quais já tem acesso. O dono de uma sala pode adicioná-lo. Ser admin geral não ignora as regras do banco.

O primeiro escritório já pertencente ao admin torna-se o principal, preservando seus agentes. Se não existir, é criado um escritório principal. Se a conta ainda não existir ou não tiver e-mail confirmado, o escritório será preparado quando essa confirmação ocorrer.

## Presença e café

- Um avatar pessoal por conta, separado dos agentes de IA. Nome e aparência são obrigatórios antes da entrada.
- A presença é registrada com identidade autenticada, renovada a cada 20 segundos e expira após 70 segundos sem sinal. Uma conta aparece em uma sala por vez.
- Os botões **Café** e **Reuniões** levam o avatar à respectiva área. A mudança é compartilhada com os demais usuários.
- Mensagens públicas e privadas com até 280 caracteres. O balão fica visível por 12 segundos; o histórico recente permanece no café.
- Mensagens privadas são filtradas pelo banco: apenas remetente e destinatário podem lê-las. O admin não recebe exceção.

## Configurar Google Agenda

No Google Cloud, habilite a **Google Calendar API**, configure a tela de consentimento OAuth e crie um cliente OAuth do tipo **Aplicativo da Web**.

Cadastre exatamente este URI de redirecionamento (ajuste se o domínio mudar):

```
https://desk-events.vercel.app/google-agenda
```

No projeto Vercel **desk-events-server**, configure:

```
SUPABASE_URL=<URL do projeto>
SUPABASE_SERVICE_ROLE_KEY=<chave privada de serviço>
APP_URL=https://desk-events.vercel.app
GOOGLE_CLIENT_ID=<cliente OAuth do Google>
GOOGLE_CLIENT_SECRET=<segredo OAuth do Google>
GOOGLE_TOKEN_ENCRYPTION_KEY=<32 bytes aleatórios em hexadecimal: 64 caracteres>
```

Gere a chave de criptografia uma vez com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` e guarde-a nas variáveis privadas. Não coloque nenhum desses segredos em variáveis `VITE_`, código do frontend ou mensagens de chat. Trocar essa chave exige reconectar as contas Google.

Publique servidor e frontend após configurar o banco e as variáveis. Em modo de teste do OAuth, adicione as contas autorizadas como usuários de teste no Google Cloud. Para uso amplo, conclua a configuração/publicação/verificação que o Google solicitar para o escopo `calendar.events`.

Cada organizador usa **Conectar meu Google Agenda**. O app solicita acesso à agenda e a identificação do e-mail. O retorno valida o estado de uso único e a mesma sessão autenticada; o token de renovação é criptografado e só pode ser lido pelo servidor.

O organizador escolhe usuários cadastrados que tenham acesso à sala. A reunião é criada na agenda dele e envia convites aos participantes com `sendUpdates=all`. O app usa o e-mail Google conectado do participante, ou seu e-mail confirmado de cadastro. A inclusão automática na agenda de cada convidado depende das preferências do Google e da resposta ao convite. Isso não concede edição irrestrita à agenda de outras pessoas.

O Google Meet é solicitado com `conferenceDataVersion=1`. Se o Google ainda estiver processando, o card mostra **Concluir agendamento**; a retentativa usa o mesmo identificador para evitar convites duplicados. Se a conta não disponibilizar Meet, o card oferece abrir o evento no Google Agenda. Cancelamento é restrito ao organizador e também avisa os convidados.

Referências oficiais: https://developers.google.com/identity/protocols/oauth2/web-server e https://developers.google.com/workspace/calendar/api/v3/reference/events/insert.

## Validação

`npm test` executa os testes, incluindo as migrações e RLS em PostgreSQL embarcado (PGlite), perfis, salas privadas, presença, privacidade do café, validação de reuniões, criptografia de tokens e animações. `npm run typecheck` e `npm run build` validam a compilação.

O teste ponta a ponta do Google exige as credenciais OAuth e uma conta conectada. Não são enviados convites reais pelos testes automatizados.
