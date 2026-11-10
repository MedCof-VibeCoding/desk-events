# Avatares padrão do Desk Events

A coleção criada para o projeto foi integrada a partir dos modelos incorporados no `Catalogo_Avatares_Desk_Events.html`.

- Perfis: Atlas, Pixel, Ritmo, Foco, Elo e Byte.
- Versões: masculina (`m`) e feminina (`f`).
- Looks: casual, escritório (`escritorio`) e evento.
- Total: 36 arquivos GLB com esqueleto e sete clipes originais, em `apps/desktop/public/avatars`.
- As prévias PNG transparentes foram renderizadas a partir de cada GLB.

`aparencia` continua armazenada como JSON no banco, agora com `personagem`, `versao` e `look`. O formulário normaliza e salva esses campos. Registros antigos ou inválidos são exibidos como Atlas masculino casual até a próxima edição; não há migração destrutiva do banco.

O escritório carrega apenas os modelos utilizados, compartilha a geometria em cache e mantém esqueletos, materiais e mixers independentes. Usa Idle em repouso, Walk nos deslocamentos, Type durante o trabalho e Wave após uma entrega. A preferência por movimento reduzido pausa os clipes. Uma prévia estática permanece visível durante o carregamento e se o GLB falhar.

Validação: `npm run typecheck`, `npm run build` e `node --test tests/workspace.test.mjs`. O último inclui integridade das 36 combinações, compatibilidade de registros antigos e independência de animações e materiais.
