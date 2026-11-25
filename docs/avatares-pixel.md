# Avatares em pixel art

O editor está em **Personalizar → Meu avatar**, na criação do perfil e na criação/edição dos agentes. A coleção Pixel art tem dez personagens e 60 acessórios, divididos em cabeça, rosto, pescoço, bolsas, mão, pulso e detalhes. A coleção de 36 avatares clássicos 3D permanece disponível.

Em **Roupas**, escolha Básica, Casual, Executiva ou Futurista. Parte de cima, calça e calçado têm cores independentes. Trocar roupa mantém os acessórios, e remover acessórios mantém a roupa. As quatro miniaturas mostram a combinação no personagem selecionado. As roupas são compostas sobre a base e acompanham as articulações, inclusive nas prévias.

As alterações do avatar pessoal são confirmadas em **Salvar meu avatar**. A edição de um agente usa o botão de salvar do formulário existente. Os dados ficam no campo JSON `aparencia` das tabelas atuais; esta mudança não exige migração de banco nem altera permissões.

## Arquivos e composição

- `apps/desktop/public/avatars/pixel/bases.png`: dez bases sem acessórios.
- `apps/desktop/public/avatars/pixel/accessories-original.png`: 30 acessórios derivados dos desenhos anteriores.
- `apps/desktop/public/avatars/pixel/accessories-extra.png`: 30 acessórios novos.
- `pixelAtlas.ts`: recortes exatos de cada peça. As margens das pranchas não são uma grade uniforme.
- `pixelCatalogo.ts`: nomes, categorias, encaixes e regras de combinação.
- `pixelRender.ts`: composição compartilhada entre prévias e sala, sem modificar os PNGs originais.

Cada imagem permanece inteira como atlas. Os recortes são usados como peças independentes em tempo de execução, evitando dezenas de requisições. Não renomeie nem redimensione as pranchas sem atualizar os recortes. As imagens aprovadas são RGBA: 1675 × 939 para as bases e 1374 × 1145 para cada prancha de acessórios.

```json
{
  "corpo": "monitor",
  "cor": "#ff6175",
  "acessorio": null,
  "personagem": "atlas",
  "versao": "m",
  "look": "casual",
  "estilo": "pixel",
  "avatarPixel": "leo",
  "roupaPixel": { "modelo": "casual", "superior": "coral", "inferior": "jeans", "calcado": "branco" },
  "acessorios": { "cabeca": "bone", "bolsa": "bolsa-coral" }
}
```

Os campos legados são preservados para compatibilidade com a validação do perfil. IDs desconhecidos são ignorados. Uma peça substitui a outra na mesma categoria; viseiras e capuz não se sobrepõem aos óculos.

## Movimento

### Representação atual no escritório

Os dez personagens usam volumes 3D no escritório e na prévia do editor. `personagemPersonalizado3d.ts` reconstrói rosto, cabelo e detalhes a partir das bases ilustradas: Orbit tem visor sorridente ciano e oito segmentos de armadura; Nox tem cabeça escura e olhos amarelos; Flora tem orelhas pontudas; os humanos têm olhos grandes e cabelos próprios. A camiseta básica tem mangas curtas, sem emblemas do personagem legado. As roupas e cores continuam independentes dos acessórios.

O esqueleto, os pesos dos membros e os clipes de movimento do modelo de referência são mantidos. A personalização não muda a escala dos ossos nem a trajetória dos pés. As placas do robô e os acessórios acompanham seus respectivos ossos. As miniaturas 2D continuam usando os atlas originais. `tests/avatar-personalizado-3d.test.mjs` verifica a passada, a substituição das superfícies antigas, os detalhes de identidade, a articulação da armadura e a liberação dos recursos.

### Estilo de desenho no 3D

Para ficar próximo da arte em pixel, `estiloDesenho3d.ts` troca os materiais dos personagens pixel por cel shading (três faixas chapadas) e acrescenta um contorno escuro por casco invertido, que usa o mesmo esqueleto e não altera a passada. Brilhos, pupilas e linhas do rosto ficam sem contorno. O rosto segue a arte: olho oval escuro com dois brilhos, cílio, rubor e sorriso; os cabelos espetados (Léo, Neo e Zuri) usam pontas e os longos (Violeta, Flora e Sol) descem até a cintura por trás dos braços. A camiseta básica tem manga própria com barra nítida, a calça é reta e os tênis são uma peça presa ao osso do pé, com sola clara, sem mexer nos vértices do pé. A geometria de crachá e cordão do modelo de referência fica escondida sob a camiseta.

### Renderizador 2D de compatibilidade

Os personagens em pixel art são imagens articuladas em uma superfície voltada para a câmera dentro da sala 3D. Coxas e canelas se deformam separadamente, com apoio alternado dos pés e sapatos horizontais; o balanço do tronco não levanta o pé apoiado. Os braços fazem contrapeso e os acessórios de mão acompanham seu pivô. Há estados de repouso, caminhada, trabalho e aceno. A passada acompanha a distância percorrida, com desenho limitado a 30 quadros por segundo. A prévia e a sala usam o mesmo controlador. Partida, frenagem e transição para repouso são graduais. A direção horizontal é espelhada; estas artes não possuem vistas novas de costas ou um esqueleto 3D.

O deslocamento usa o sistema de rotas já existente: agentes caminham pela sala e voltam à mesa ao trabalhar; pessoas caminham quando mudam de área. Esta implementação não acrescenta controle de movimento por WASD.

Animações respeitam a preferência do escritório e a redução de movimento do sistema. Desativar um agente congela sua animação. Trocar acessórios de uma pessoa preserva sua posição e rota. Texturas e materiais individuais são liberados quando um personagem sai da cena.

## Validação

`npm run typecheck`, `npm run build` e `npm test` verificam tipos, produção, regressões e as regras do catálogo. `tests/pixel-avatar.test.mjs` confere arquivos reais, recortes, normalização e persistência das roupas, categorias, conflitos, apoio dos pés ao longo do ciclo, cadência independente da taxa de quadros, frenagem e cache/retentativa de imagens.

Quadros estáticos da caminhada e das quatro roupas foram renderizados localmente para inspeção. A inspeção interativa e a persistência em uma sessão autenticada precisam ser verificadas no navegador do ambiente onde a aplicação roda. O ambiente de testes encontrou bloqueio de acesso a sockets; isso não é evidência de falha da aplicação.
