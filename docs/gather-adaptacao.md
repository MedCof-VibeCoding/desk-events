# Interfaces do escritório

Referências públicas analisadas em 10/11/2026:
- https://www.gather.town/pt/
- https://www.gather.town/pt/features
- https://www.gather.town/pt/virtual-office
- https://www.gather.town/pt/compare

A adaptação usa a organização do produto como referência, preservando o Desk Events e os personagens MedCof. Não é uma reprodução de todas as telas privadas do Gather, que não foram acessadas.

| Área | Implementação |
| --- | --- |
| Acesso | Entrada e cadastro com apresentação dos personagens; autenticação Supabase existente |
| Navegação | Menu lateral, identificação do escritório, acesso às tarefas, chat, reuniões e preferências |
| Escritório | Cena 3D existente com os quatro personagens fornecidos, zoom, centralização e atalhos para áreas |
| Visão simplificada | Cartões de agentes, busca por nome/cargo e filtro por disponibilidade real |
| Agentes | Clássico, Fotógrafo, Campeão e Pesquisador na criação, edição, mapa e painéis; compatibilidade com aparências antigas |
| Atividade | Últimas 100 tarefas, filtro por estado, pedido e resultado, atualização pelo Realtime |
| Sua mesa | Aprovações existentes, com os mesmos papéis de acesso |
| Chat | Canais Geral, Eventos e Operação; últimas 100 mensagens persistentes por canal; Realtime |
| Reuniões | Agenda compartilhada, pauta, duração, histórico, cancelamento e abertura de link HTTPS externo |
| Personalizar | Temas sistema/claro/escuro, animação, modo foco e personagens; preferências por usuário neste navegador |
| Arquivos locais | Conexão de pasta existente preservada em Personalizar |

## Ativação

1. Aplicar `supabase/migrations/0004_colaboracao.sql` no projeto correto, após as migrações anteriores. A migração cria chat e reuniões, políticas por escritório e publicação Realtime.
2. Publicar o frontend atualizado. Não é necessária alteração de chave ou variável para esses módulos.
3. Validar com duas contas do mesmo escritório e uma de outro escritório: isolamento dos dados, recebimento de mensagens, agenda e papéis. Leitores apenas consultam; operadores enviam/agendam; cancelamento é permitido ao autor operador ou a editores.

Sem essa migração, chat e reuniões exibem um aviso de indisponibilidade e não simulam sucesso. A migração e o deploy não foram executados nesta alteração.

## Limites de cobertura

As chamadas abrem no serviço do link informado. Não há áudio/vídeo nativo, áudio por proximidade, gravação, compartilhamento de tela, transcrição de reuniões, integração com calendários, mensagens privadas, anexos, editor livre de mapas ou presença de pessoas nesta entrega. Os indicadores de disponibilidade representam agentes e suas tarefas reais.

O modo foco recolhe a navegação e reduz movimento localmente; não informa disponibilidade de pessoas à equipe. As mudanças de tema afetam a interface, e não os materiais do cenário 3D. O escritório conserva a capacidade visual original de 12 posições de mesa.

## Verificação

```sh
npm run typecheck
npm run build
node --test tests/workspace.test.mjs
```

O teste automatizado cobre links de reunião, preferências inválidas, variações antigas, proporções dos arquivos, ciclo de sprites/texturas, criação por papel e a seleção inicial no formulário. Não substitui testes integrados de banco nem validação visual. A validação visual desta alteração foi bloqueada pela automação do Chrome, que não conseguiu identificar a URL atual com segurança.
