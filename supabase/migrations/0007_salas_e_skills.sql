-- Sala pessoal automática e biblioteca de skills. Execute após 0006_google_agenda.sql.
begin;

-- ---------- sala pessoal ----------
-- Cada pessoa tem uma sala própria, criada sozinha quando o perfil fica completo.
alter table public.escritorios add column pessoal boolean not null default false;
alter table public.escritorios add constraint escritorio_pessoal_nao_principal check (not (pessoal and principal));
update public.escritorios set pessoal = true
  where id in (select distinct on (criado_por) id from public.escritorios where not principal order by criado_por, criado_em);
create unique index escritorio_pessoal_unico on public.escritorios(criado_por) where pessoal;

create function public.criar_sala_pessoal(pessoa uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare sala uuid; quem text;
begin
  perform pg_advisory_xact_lock(hashtextextended(pessoa::text, 7));
  select id into sala from public.escritorios where criado_por = pessoa and pessoal;
  if sala is not null then return sala; end if;
  select nome into quem from public.perfis where user_id = pessoa;
  insert into public.escritorios(nome, criado_por, pessoal)
    values (left('Sala de ' || coalesce(nullif(trim(quem), ''), 'você'), 80), pessoa, true)
    returning id into sala;
  return sala;
end $$;

create function public.perfil_completo_cria_sala() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.aparencia is not null and length(trim(new.nome)) > 0
     and exists (select 1 from auth.users where id = new.user_id and email_confirmed_at is not null) then
    perform public.criar_sala_pessoal(new.user_id);
  end if;
  return new;
end $$;
create trigger perfil_cria_sala after insert or update of nome, aparencia on public.perfis
  for each row execute function public.perfil_completo_cria_sala();

-- Chamado pelo site ao entrar: devolve a sala da pessoa e cria se ainda não existir.
create function public.minha_sala() returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.perfil_pronto() then return null; end if;
  return public.criar_sala_pessoal(auth.uid());
end $$;

-- Quem já tem perfil completo ganha a sala agora.
select public.criar_sala_pessoal(p.user_id) from public.perfis p join auth.users u on u.id = p.user_id
  where p.aparencia is not null and length(trim(p.nome)) > 0 and u.email_confirmed_at is not null;

-- A sala pessoal não pode ser apagada.
drop policy escritorios_apagar on public.escritorios;
create policy escritorios_apagar on public.escritorios for delete to authenticated
  using (not principal and not pessoal and public.tenho_papel(id, 'dono'));

revoke all on function public.criar_sala_pessoal(uuid), public.perfil_completo_cria_sala() from public, anon, authenticated;
revoke all on function public.minha_sala() from public, anon;
grant execute on function public.minha_sala() to authenticated;

-- ---------- skills ----------
-- Skills de fábrica valem para todos (sem sala). As criadas pelas pessoas pertencem a uma sala.
alter table public.skills alter column escritorio_id drop not null;
alter table public.skills add column categoria text not null default 'Personalizadas' check (char_length(categoria) between 1 and 40);
alter table public.skills add column criado_por uuid default auth.uid() references auth.users(id) on delete set null;
alter table public.skills add constraint skills_fabrica_sem_sala check (de_fabrica = (escritorio_id is null));
alter table public.skills add constraint skills_instrucoes_tamanho check (char_length(instrucoes) between 10 and 8000);
alter table public.skills add constraint skills_titulo_tamanho check (char_length(trim(titulo)) between 2 and 60);
create unique index skills_fabrica_nome on public.skills(nome) where de_fabrica;

drop policy skills_ler on public.skills;
create policy skills_ler on public.skills for select to authenticated
  using (de_fabrica or public.tenho_papel(escritorio_id, 'leitor'));
drop policy skills_editar on public.skills;
create policy skills_editar on public.skills for all to authenticated
  using (not de_fabrica and public.tenho_papel(escritorio_id, 'editor'))
  with check (not de_fabrica and public.tenho_papel(escritorio_id, 'editor'));

-- Um agente só recebe skills de fábrica ou da própria sala.
drop policy agente_skill_editar on public.agente_skill;
create policy agente_skill_editar on public.agente_skill for all to authenticated
  using (public.tenho_papel(escritorio_id, 'editor'))
  with check (
    public.tenho_papel(escritorio_id, 'editor')
    and exists (select 1 from public.agentes a where a.id = agente_id and a.escritorio_id = agente_skill.escritorio_id)
    and exists (select 1 from public.skills s where s.id = skill_id and (s.de_fabrica or s.escritorio_id = agente_skill.escritorio_id))
  );

insert into public.skills (nome, titulo, categoria, descricao, instrucoes, ferramentas, de_fabrica, escritorio_id, criado_por)
select v.*, true, null::uuid, null::uuid from (values
  ($s$pesquisa-web$s$, $s$Pesquisa na web$s$, $s$Pesquisa e análise$s$, $s$Pesquisa um tema em páginas públicas, compara fontes e entrega um resumo com os links usados.$s$, $s$1. Transforme o pedido em 2 a 4 perguntas objetivas.
2. Leia pelo menos duas fontes diferentes com a ferramenta de páginas; prefira sites oficiais, órgãos públicos e veículos reconhecidos.
3. Quando as fontes discordarem, diga isso e mostre cada versão.
4. Entregue: resposta direta em até 3 parágrafos, depois uma lista "Fontes" com o endereço de cada página lida.
5. Nunca invente dados, números ou citações; se não encontrar, diga que não encontrou.$s$, array['buscar_url']::text[]),
  ($s$analise-concorrencia$s$, $s$Análise de concorrentes$s$, $s$Pesquisa e análise$s$, $s$Compara empresas, produtos ou eventos concorrentes em preço, proposta, público e pontos fortes e fracos.$s$, $s$1. Confirme quais concorrentes entram na análise; se o pedido não disser, escolha no máximo 4 e explique o critério.
2. Para cada um, levante: proposta de valor, público, preço ou faixa, canais e diferenciais, citando a fonte.
3. Monte uma tabela comparativa com os mesmos critérios para todos.
4. Feche com 3 oportunidades e 3 riscos para quem pediu.$s$, array['buscar_url']::text[]),
  ($s$analise-dados$s$, $s$Análise de dados e planilhas$s$, $s$Pesquisa e análise$s$, $s$Lê arquivos CSV ou tabelas, confere totais, encontra padrões e aponta inconsistências.$s$, $s$1. Descreva rapidamente a estrutura: colunas, número de linhas e período coberto.
2. Confira totais e procure linhas duplicadas, vazias ou fora do padrão.
3. Calcule só o que o pedido precisa (somas, médias, variações, rankings) e mostre a conta usada.
4. Entregue: principais achados em tópicos, uma tabela resumo e a lista de inconsistências encontradas.
5. Se gravar um arquivo de saída, use CSV ou Markdown e diga o nome do arquivo.$s$, array['ler_arquivo','listar_arquivos','escrever_arquivo']::text[]),
  ($s$resumo-documentos$s$, $s$Resumo de documentos$s$, $s$Pesquisa e análise$s$, $s$Resume textos longos em níveis: uma frase, um parágrafo e os pontos principais.$s$, $s$1. Leia o documento inteiro antes de resumir.
2. Entregue em três níveis: uma frase; um parágrafo; de 5 a 8 tópicos com os pontos principais.
3. Separe fatos de opiniões do autor.
4. Liste prazos, valores, nomes e decisões que aparecem no texto.
5. Não acrescente informação que não esteja no documento.$s$, array['ler_arquivo','buscar_url']::text[]),
  ($s$redacao-clara$s$, $s$Redação clara$s$, $s$Escrita e comunicação$s$, $s$Escreve textos simples e diretos, em linguagem clara, adequados a quem vai ler.$s$, $s$1. Identifique quem vai ler e o que essa pessoa precisa fazer depois de ler.
2. Comece pelo mais importante. Uma ideia por parágrafo, frases curtas, voz ativa.
3. Troque jargão por palavras comuns; quando o termo técnico for necessário, explique na primeira vez.
4. Use listas só para passos ou itens paralelos.
5. Revise cortando palavras que não mudam o sentido.$s$, '{}'::text[]),
  ($s$email-profissional$s$, $s$E-mails profissionais$s$, $s$Escrita e comunicação$s$, $s$Redige e responde e-mails com assunto claro, pedido explícito e tom adequado.$s$, $s$1. Assunto com no máximo 8 palavras, dizendo do que se trata.
2. Primeira frase com o motivo do e-mail; o pedido ou a decisão aparece logo no início.
3. Contexto só o necessário, em no máximo 2 parágrafos.
4. Feche com o próximo passo e o prazo, se houver.
5. Ajuste o tom ao destinatário (cliente, fornecedor, liderança, colega). Nunca envie; entregue o rascunho.$s$, '{}'::text[]),
  ($s$comunicacao-interna$s$, $s$Comunicados internos$s$, $s$Escrita e comunicação$s$, $s$Escreve comunicados, atualizações de status e avisos para o time, no formato que a empresa costuma usar.$s$, $s$1. Defina o tipo: aviso, atualização de status, mudança de processo ou reconhecimento.
2. Título que já diga a novidade.
3. Estrutura: o que mudou, por que, o que muda para quem lê, a partir de quando, onde tirar dúvidas.
4. Atualização de status: progresso, próximos passos, riscos e pedidos de ajuda, nessa ordem.
5. Tom humano e direto, sem exagero.$s$, '{}'::text[]),
  ($s$revisao-texto$s$, $s$Revisão de texto$s$, $s$Escrita e comunicação$s$, $s$Revisa ortografia, gramática, clareza e consistência em português do Brasil.$s$, $s$1. Corrija ortografia, acentuação, concordância e pontuação conforme a norma do português do Brasil.
2. Aponte frases ambíguas ou longas demais e proponha a versão melhorada.
3. Verifique consistência de nomes, datas, números e termos.
4. Entregue o texto revisado e, depois, a lista das mudanças mais importantes.
5. Preserve o estilo e o sentido do autor; não reescreva o que já está bom.$s$, '{}'::text[]),
  ($s$traducao$s$, $s$Tradução$s$, $s$Escrita e comunicação$s$, $s$Traduz textos entre português, inglês e espanhol mantendo sentido, tom e termos técnicos.$s$, $s$1. Identifique o tom do original (formal, comercial, técnico, informal) e mantenha.
2. Traduza o sentido, não palavra por palavra; adapte expressões e formatos de data, moeda e medida.
3. Mantenha nomes próprios, marcas e termos técnicos consagrados.
4. Quando houver duas escolhas possíveis, mostre a escolhida e a alternativa em nota.$s$, '{}'::text[]),
  ($s$voz-da-marca$s$, $s$Voz da marca$s$, $s$Escrita e comunicação$s$, $s$Aplica o tom de voz, o vocabulário e as regras de estilo da marca em qualquer texto.$s$, $s$1. Procure na pasta de trabalho um arquivo de guia da marca; se existir, siga exatamente.
2. Sem guia, pergunte ou deduza o tom a partir de textos anteriores da empresa e diga o que assumiu.
3. Revise o texto aplicando: tom, palavras preferidas e proibidas, formato de títulos e chamadas.
4. Entregue o texto ajustado e uma nota curta com o que foi mudado.$s$, array['ler_arquivo','listar_arquivos']::text[]),
  ($s$relatorio$s$, $s$Relatórios$s$, $s$Documentos$s$, $s$Monta relatórios com resumo executivo, dados, análise e recomendações.$s$, $s$1. Abra com um resumo executivo de até 5 linhas: situação, principal número e recomendação.
2. Seções: contexto, dados, análise, riscos, recomendações e próximos passos.
3. Todo número com a fonte e o período.
4. Recomendações acionáveis, com responsável sugerido e prazo.
5. Se for gravar, use Markdown com títulos claros.$s$, array['escrever_arquivo']::text[]),
  ($s$apresentacao$s$, $s$Roteiro de apresentação$s$, $s$Documentos$s$, $s$Cria o roteiro de slides: título, mensagem principal e conteúdo de cada slide.$s$, $s$1. Defina público, objetivo e tempo disponível; use cerca de 1 slide por minuto.
2. Estrutura: abertura com o problema, desenvolvimento, proposta e pedido final.
3. Para cada slide: título que é uma afirmação, até 3 tópicos, sugestão de visual e nota do apresentador.
4. Entregue em Markdown, um bloco por slide.$s$, array['escrever_arquivo']::text[]),
  ($s$ata-reuniao$s$, $s$Ata e resumo de reunião$s$, $s$Documentos$s$, $s$Transforma anotações ou transcrições em decisões, pendências, responsáveis e prazos.$s$, $s$1. Cabeçalho: data, participantes e pauta.
2. Decisões tomadas, uma por linha.
3. Pendências em tabela: tarefa, responsável, prazo.
4. Pontos em aberto e o que precisa ser decidido na próxima reunião.
5. Não atribua uma tarefa a alguém se as anotações não disserem; marque como "responsável a definir".$s$, array['ler_arquivo','escrever_arquivo']::text[]),
  ($s$planilhas$s$, $s$Montagem de planilhas$s$, $s$Documentos$s$, $s$Organiza dados em tabelas CSV prontas para abrir no Excel ou no Google Sheets.$s$, $s$1. Defina as colunas antes de preencher; nomes curtos e sem acento no cabeçalho.
2. Uma linha por registro, datas em AAAA-MM-DD, números sem símbolo de moeda.
3. Use ponto e vírgula como separador para abrir corretamente no Excel em português.
4. Grave o arquivo .csv e explique o que cada coluna significa.$s$, array['escrever_arquivo','ler_arquivo']::text[]),
  ($s$redes-sociais$s$, $s$Posts para redes sociais$s$, $s$Marketing e vendas$s$, $s$Cria posts para Instagram e LinkedIn com gancho, texto, chamada para ação e hashtags.$s$, $s$1. Pergunte ou defina a rede, o objetivo e o público.
2. Primeira linha forte (gancho) com no máximo 12 palavras.
3. Texto adaptado à rede: LinkedIn mais explicativo; Instagram mais curto, com quebras de linha.
4. Chamada para ação clara e de 3 a 6 hashtags relevantes.
5. Entregue duas versões para escolha.$s$, '{}'::text[]),
  ($s$seo-conteudo$s$, $s$SEO para conteúdo$s$, $s$Marketing e vendas$s$, $s$Planeja e revisa textos para o site aparecerem bem nas buscas.$s$, $s$1. Defina a palavra-chave principal e 3 a 5 variações.
2. Título com até 60 caracteres e meta descrição com até 155, ambos com a palavra-chave.
3. Estrutura com subtítulos que respondem às dúvidas reais de quem busca.
4. Sugira links internos e o texto alternativo das imagens.
5. Nunca repita a palavra-chave de forma forçada.$s$, array['buscar_url']::text[]),
  ($s$prospeccao$s$, $s$Prospecção e vendas$s$, $s$Marketing e vendas$s$, $s$Pesquisa empresas e contatos e escreve abordagens personalizadas para venda ou parceria.$s$, $s$1. Pesquise a empresa: o que faz, momento atual e um fato recente que justifique o contato.
2. Escreva a abordagem em até 120 palavras: motivo do contato ligado a esse fato, proposta de valor em uma frase, pedido pequeno (uma conversa de 15 minutos).
3. Sugira dois follow-ups curtos para 3 e 7 dias depois.
4. Não invente informações sobre a empresa ou sobre a pessoa.$s$, array['buscar_url']::text[]),
  ($s$campanha-marketing$s$, $s$Plano de campanha$s$, $s$Marketing e vendas$s$, $s$Monta um plano de campanha com objetivo, público, mensagem, canais, cronograma e métricas.$s$, $s$1. Objetivo mensurável e prazo.
2. Público principal e mensagem central em uma frase.
3. Canais com o papel de cada um e o formato das peças.
4. Cronograma semana a semana.
5. Métricas de sucesso e como medir cada uma.$s$, '{}'::text[]),
  ($s$planejamento-evento$s$, $s$Planejamento de evento$s$, $s$Eventos$s$, $s$Organiza um evento do zero: cronograma, checklist, fornecedores, orçamento e riscos.$s$, $s$1. Confirme formato, data, local, público esperado e orçamento.
2. Cronograma regressivo com marcos (contratações, divulgação, inscrições, montagem).
3. Checklist por área: local, palestrantes, fornecedores, tecnologia, comunicação, credenciamento.
4. Orçamento em tabela, separando custos fixos e por participante.
5. Riscos principais com plano B para cada um.$s$, array['escrever_arquivo']::text[]),
  ($s$relatorio-pos-evento$s$, $s$Relatório pós-evento$s$, $s$Eventos$s$, $s$Consolida resultados de um evento: público, satisfação, receita, custos e aprendizados.$s$, $s$1. Números principais: inscritos, presentes, taxa de comparecimento, receita, custo e resultado.
2. Satisfação: notas e comentários mais frequentes, positivos e negativos.
3. O que funcionou e o que não funcionou, com exemplos.
4. Recomendações concretas para a próxima edição.$s$, array['ler_arquivo','escrever_arquivo']::text[]),
  ($s$triagem-pedidos$s$, $s$Triagem de pedidos$s$, $s$Produto e tecnologia$s$, $s$Classifica pedidos em bug, melhoria ou dúvida, define prioridade e resume em uma linha.$s$, $s$Responda neste formato:
TIPO: bug, melhoria ou dúvida
PRIORIDADE: alta, média ou baixa (alta = impede uso, pagamento ou inscrição)
ÁREA: uma ou duas palavras
RESUMO: uma frase de até 60 caracteres
Se faltar informação para classificar, diga o que falta.$s$, '{}'::text[]),
  ($s$diagnostico-bug$s$, $s$Diagnóstico de bug$s$, $s$Produto e tecnologia$s$, $s$Investiga um problema relatado e lista causas prováveis, evidências e o que verificar.$s$, $s$1. Reescreva o problema: o que acontece, onde, com quem e desde quando.
2. Liste até 3 causas prováveis, da mais para a menos provável.
3. Para cada causa, a verificação mais rápida que confirma ou descarta.
4. Diga como reproduzir o problema passo a passo.$s$, array['ler_arquivo','buscar_url']::text[]),
  ($s$revisao-codigo$s$, $s$Revisão de código$s$, $s$Produto e tecnologia$s$, $s$Revisa código ou plano de correção apontando erros, riscos de segurança e melhorias.$s$, $s$1. Primeiro, o que pode quebrar: erros de lógica, casos de borda e tratamento de erro.
2. Segurança: entrada não validada, segredos no código, permissões amplas demais.
3. Clareza e manutenção, sem discutir gosto pessoal.
4. Cada ponto com local, problema e sugestão de correção.
5. Termine com um veredito: aprovado, aprovado com ajustes ou precisa refazer.$s$, array['ler_arquivo','listar_arquivos']::text[]),
  ($s$documentacao-tecnica$s$, $s$Documentação técnica$s$, $s$Produto e tecnologia$s$, $s$Escreve READMEs, guias de uso e documentação de APIs e processos.$s$, $s$1. Comece pelo que é e para quem serve, em duas frases.
2. Passos de instalação ou uso numerados, com os comandos exatos.
3. Exemplos reais de uso e de resposta.
4. Seção de problemas comuns e como resolver.
5. Grave em Markdown.$s$, array['ler_arquivo','listar_arquivos','escrever_arquivo']::text[]),
  ($s$casos-de-teste$s$, $s$Casos de teste$s$, $s$Produto e tecnologia$s$, $s$Cria casos de teste para uma funcionalidade, cobrindo o fluxo principal e os casos de borda.$s$, $s$1. Liste as regras da funcionalidade que precisam ser verdade.
2. Para cada regra, casos de teste no formato: dado, quando, então.
3. Inclua casos de borda: campos vazios, valores no limite, permissões, conexão lenta.
4. Marque a prioridade de cada caso.$s$, '{}'::text[]),
  ($s$planejamento-projeto$s$, $s$Planejamento de projeto$s$, $s$Gestão$s$, $s$Quebra um objetivo em etapas, tarefas, responsáveis, prazos e riscos.$s$, $s$1. Objetivo e critério de "pronto".
2. Etapas em ordem, cada uma com tarefas de no máximo alguns dias.
3. Tabela: tarefa, responsável sugerido, prazo, dependência.
4. Riscos principais e como reduzir cada um.
5. Marque o caminho crítico.$s$, array['escrever_arquivo']::text[]),
  ($s$relatorio-semanal$s$, $s$Relatório semanal$s$, $s$Gestão$s$, $s$Junta o que foi feito na semana em um texto único: entregas, números, bloqueios e próximos passos.$s$, $s$1. Destaques da semana em até 5 tópicos.
2. Números que mudaram, comparados com a semana anterior.
3. Bloqueios e o que é preciso para destravar.
4. Prioridades da próxima semana.
5. No máximo uma página.$s$, array['ler_arquivo']::text[]),
  ($s$apoio-decisao$s$, $s$Apoio à decisão$s$, $s$Gestão$s$, $s$Organiza uma decisão: opções, critérios, prós e contras e uma recomendação justificada.$s$, $s$1. Descreva a decisão e o prazo para tomá-la.
2. Liste de 2 a 4 opções reais, incluindo não fazer nada.
3. Critérios com peso (custo, prazo, risco, impacto).
4. Tabela com as opções avaliadas em cada critério.
5. Recomende uma opção e diga o que faria mudar a recomendação.$s$, '{}'::text[]),
  ($s$criador-de-skills$s$, $s$Criador de skills$s$, $s$Habilidades do escritório$s$, $s$Entrevista a pessoa e escreve uma skill nova no formato certo, pronta para cadastrar.$s$, $s$1. Pergunte: qual tarefa a skill resolve, quem usa, o que entra e o que sai.
2. Peça um exemplo de resultado bom.
3. Escreva a skill com: nome curto, descrição de uma frase dizendo quando usar, e instruções em passos numerados.
4. Inclua o que o agente nunca deve fazer.
5. Entregue pronta para colar em "Criar skill".$s$, '{}'::text[])
) as v(nome, titulo, categoria, descricao, instrucoes, ferramentas)
on conflict (nome) where de_fabrica do update set titulo = excluded.titulo, categoria = excluded.categoria, descricao = excluded.descricao, instrucoes = excluded.instrucoes, ferramentas = excluded.ferramentas;

commit;
