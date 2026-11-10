-- Escritório de Agentes — fase 1: base compartilhada
-- Tabelas, papéis e regras por linha (RLS). Rodar num projeto Supabase novo.

create extension if not exists pgcrypto;

-- ---------- tipos ----------
create type papel as enum ('leitor', 'operador', 'editor', 'dono');
create type provedor as enum ('anthropic', 'openai', 'google');
create type autonomia as enum ('assistido', 'supervisionado', 'autonomo', 'livre');
create type tipo_conexao as enum ('mcp_local', 'mcp_remoto', 'api_http', 'webhook');
create type risco as enum ('leitura', 'escrita', 'irreversivel');
create type estado_ficha as enum ('fila', 'trabalhando', 'aguardando_aprovacao', 'entregue', 'cancelada', 'erro');
create type origem_ficha as enum ('pessoa', 'agenda', 'webhook', 'agente');
create type tipo_passo as enum ('mensagem', 'ferramenta', 'resultado', 'repasse', 'sistema');
create type estado_aprovacao as enum ('pendente', 'aprovada', 'recusada');

-- ---------- escritório e membros ----------
create table escritorios (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(nome) between 1 and 80),
  teto_mes_usd numeric(10,2),
  pausado boolean not null default false,
  criado_por uuid not null default auth.uid() references auth.users(id),
  criado_em timestamptz not null default now()
);

create table membros (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  papel papel not null default 'leitor',
  criado_em timestamptz not null default now(),
  primary key (escritorio_id, user_id)
);
create index membros_user_idx on membros(user_id);

-- Papel de quem está logado no escritório (null se não for membro).
create function meu_papel(esc uuid) returns papel
language sql stable security definer set search_path = public as $$
  select m.papel from membros m where m.escritorio_id = esc and m.user_id = auth.uid()
$$;

-- Verdadeiro se quem está logado tem pelo menos o papel pedido.
create function tenho_papel(esc uuid, minimo papel) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel(esc) >= minimo, false)
$$;

-- Quem cria o escritório vira dono.
create function escritorio_criado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into membros (escritorio_id, user_id, papel) values (new.id, new.criado_por, 'dono');
  return new;
end $$;
create trigger escritorio_criado after insert on escritorios
  for each row execute function escritorio_criado();

-- ---------- agentes ----------
create table agentes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  nome text not null check (length(nome) between 1 and 40),
  cargo text not null default '',
  instrucoes text not null default '',
  aparencia jsonb not null default '{"corpo":"monitor","cor":"#2BB3A3","acessorio":null}',
  mesa jsonb not null default '{"x":0,"y":0}',
  provedor provedor not null,
  modelo text not null,
  autonomia autonomia not null default 'supervisionado',
  coordenador boolean not null default false,
  max_passos int not null default 20 check (max_passos between 1 and 200),
  teto_ficha_usd numeric(10,2),
  teto_dia_usd numeric(10,2),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (escritorio_id, nome)
);

-- Para quem cada agente pode passar a ficha.
create table agente_repasse (
  agente_id uuid not null references agentes(id) on delete cascade,
  para_agente_id uuid not null references agentes(id) on delete cascade,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  primary key (agente_id, para_agente_id),
  check (agente_id <> para_agente_id)
);

-- ---------- skills ----------
create table skills (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  nome text not null check (nome ~ '^[a-z0-9-]{2,60}$'),
  titulo text not null,
  descricao text not null check (length(descricao) between 10 and 400),
  instrucoes text not null,
  ferramentas text[] not null default '{}',
  de_fabrica boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (escritorio_id, nome)
);

create table agente_skill (
  agente_id uuid not null references agentes(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  primary key (agente_id, skill_id)
);

-- ---------- conexões e ferramentas ----------
create table conexoes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  tipo tipo_conexao not null,
  nome text not null,
  config jsonb not null default '{}',           -- endereço, comando, operações; nunca segredos
  segredo_id uuid,                              -- id do segredo no Vault, se houver
  dono_user_id uuid references auth.users(id),  -- conexões com login pessoal
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (escritorio_id, nome)
);

create table ferramentas (
  id uuid primary key default gen_random_uuid(),
  conexao_id uuid not null references conexoes(id) on delete cascade,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  nome text not null,
  descricao text not null default '',
  parametros jsonb not null default '{"type":"object","properties":{}}',
  risco risco not null default 'escrita',
  unique (conexao_id, nome)
);

create table agente_ferramenta (
  agente_id uuid not null references agentes(id) on delete cascade,
  ferramenta_id uuid not null references ferramentas(id) on delete cascade,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  primary key (agente_id, ferramenta_id)
);

-- Qual segredo do Vault guarda a chave de cada provedor. O valor nunca fica aqui.
create table chaves_provedor (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  provedor provedor not null,
  segredo_id uuid not null,
  atualizado_em timestamptz not null default now(),
  primary key (escritorio_id, provedor)
);

-- ---------- fichas, passos, aprovações, agendas ----------
create table fichas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  titulo text not null,
  pedido text not null check (length(pedido) between 1 and 8000),
  estado estado_ficha not null default 'fila',
  agente_atual uuid references agentes(id) on delete set null,
  origem origem_ficha not null default 'pessoa',
  criado_por uuid default auth.uid() references auth.users(id),
  resultado text,
  custo_usd numeric(10,4) not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index fichas_fila_idx on fichas(escritorio_id, estado, criado_em);

create table passos (
  id bigint generated always as identity primary key,
  ficha_id uuid not null references fichas(id) on delete cascade,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  agente_id uuid references agentes(id) on delete set null,
  tipo tipo_passo not null,
  conteudo jsonb not null,
  tokens_entrada int not null default 0,
  tokens_saida int not null default 0,
  custo_usd numeric(10,4) not null default 0,
  criado_em timestamptz not null default now()
);
create index passos_ficha_idx on passos(ficha_id, id);

create table aprovacoes (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references fichas(id) on delete cascade,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  agente_id uuid references agentes(id) on delete set null,
  ferramenta_id uuid references ferramentas(id) on delete set null,
  pedido jsonb not null,                         -- o que o agente quer fazer e com quais dados
  estado estado_aprovacao not null default 'pendente',
  comentario text,
  decidido_por uuid references auth.users(id),
  decidido_em timestamptz,
  criado_em timestamptz not null default now()
);
create index aprovacoes_pendentes_idx on aprovacoes(escritorio_id) where estado = 'pendente';

create table agendas (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references agentes(id) on delete cascade,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  cron text not null,
  pedido text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------- regras por linha ----------
-- Leitura: qualquer membro. Configuração (agentes, skills, conexões): editor ou dono.
-- Operação (fichas, aprovações): operador ou acima. Chaves, membros e tetos: só dono.
-- Passos são escritos apenas pelo servidor de agentes (chave de serviço, que ignora RLS).

alter table escritorios enable row level security;
create policy escritorios_ler on escritorios for select using (tenho_papel(id, 'leitor') or criado_por = auth.uid());
create policy escritorios_criar on escritorios for insert with check (criado_por = auth.uid());
create policy escritorios_alterar on escritorios for update using (tenho_papel(id, 'dono')) with check (tenho_papel(id, 'dono'));
create policy escritorios_apagar on escritorios for delete using (tenho_papel(id, 'dono'));

alter table membros enable row level security;
create policy membros_ler on membros for select using (tenho_papel(escritorio_id, 'leitor'));
create policy membros_gerir on membros for all using (tenho_papel(escritorio_id, 'dono')) with check (tenho_papel(escritorio_id, 'dono'));

alter table chaves_provedor enable row level security;
create policy chaves_dono on chaves_provedor for all using (tenho_papel(escritorio_id, 'dono')) with check (tenho_papel(escritorio_id, 'dono'));

do $$
declare t text;
begin
  -- configuração: leitura por membros, escrita por editor
  foreach t in array array['agentes','agente_repasse','skills','agente_skill','conexoes','ferramentas','agente_ferramenta','agendas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (tenho_papel(escritorio_id, ''leitor''))', t || '_ler', t);
    execute format('create policy %I on %I for all using (tenho_papel(escritorio_id, ''editor'')) with check (tenho_papel(escritorio_id, ''editor''))', t || '_editar', t);
  end loop;
end $$;

alter table fichas enable row level security;
create policy fichas_ler on fichas for select using (tenho_papel(escritorio_id, 'leitor'));
create policy fichas_criar on fichas for insert with check (tenho_papel(escritorio_id, 'operador') and criado_por = auth.uid());
create policy fichas_alterar on fichas for update using (tenho_papel(escritorio_id, 'operador')) with check (tenho_papel(escritorio_id, 'operador'));
create policy fichas_apagar on fichas for delete using (tenho_papel(escritorio_id, 'editor'));

alter table passos enable row level security;
create policy passos_ler on passos for select using (tenho_papel(escritorio_id, 'leitor'));

alter table aprovacoes enable row level security;
create policy aprovacoes_ler on aprovacoes for select using (tenho_papel(escritorio_id, 'leitor'));
create policy aprovacoes_decidir on aprovacoes for update
  using (tenho_papel(escritorio_id, 'operador') and estado = 'pendente')
  with check (tenho_papel(escritorio_id, 'operador') and estado in ('aprovada', 'recusada') and decidido_por = auth.uid());

-- Carimbo de alteração nas fichas.
create function carimbar() returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;
create trigger fichas_carimbo before update on fichas for each row execute function carimbar();
