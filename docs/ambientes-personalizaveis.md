# Ambientes personalizáveis

Na visualização **Escritório**, donos e editores encontram **Decorar escritório**. Os demais participantes veem a decoração compartilhada, sem controles de alteração.

- Dez paletas e dez disposições: Clássico, Industrial, Jardim, Minimalista, Executivo, Tech, Criativo, Café, Biblioteca e Estúdio.
- Catálogo de 48 móveis e acessórios, modelados em Three.js a partir da direção visual dos conceitos isométricos. Não são imagens planas recortadas dos painéis conceituais.
- Seleção por clique ou lista; arrastar e soltar na cena; ajustes de 0,25 m; giros de 90°; duplicação e remoção. Acessórios pequenos são colocados sobre mesas.
- As estações dos agentes podem ser movidas, giradas, excluídas e recolocadas. Sem a estação, o agente usa o lugar padrão.
- Trocar a paleta preserva a disposição. **Aplicar disposição deste estilo** substitui a prévia; o painel permite desfazer essa operação.
- **Cancelar** descarta a prévia. **Salvar sala** publica a decoração para os participantes; revisões concorrentes são rejeitadas sem sobrescrever a outra pessoa.
- Até 100 itens por sala. A navegação dos personagens usa uma grade recalculada conforme os móveis.

## Colisão dos personagens

Móveis, cadeiras e limites da sala bloqueiam o deslocamento de agentes e participantes. A colisão considera um raio de 0,28 m e verifica todo o segmento percorrido em cada quadro, inclusive contra divisórias finas. Tapetes permanecem transitáveis.

Os caminhos são recalculados quando a decoração muda; nascimento e destinos ocupados usam uma posição livre. Um destino sem caminho acessível não permite atravessar o obstáculo. As posições de trabalho ficam ao lado das cadeiras, fora dos volumes sólidos.

## Banco de dados

Aplicar `supabase/migrations/0012_ambientes_escritorio.sql` e, em seguida, `supabase/migrations/0013_ambientes_estacoes_opcionais.sql`, no projeto Supabase usado pelo site, antes de disponibilizar a atualização. A tabela tem leitura restrita por RLS; a gravação acontece somente pela função `salvar_ambiente`, que valida associação com papel editor/dono, conteúdo, limites e revisão.

Sem a migração ou sem conexão, o site informa a indisponibilidade e permite visualizar os modelos, mas não anuncia salvamento nem grava somente no navegador como se fosse compartilhado.

O código não aplica a migração remota automaticamente e não altera permissões existentes.
