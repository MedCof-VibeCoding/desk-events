-- Ponte local: o programa no computador da pessoa que executa pedidos dos agentes.
create type estado_local as enum ('pendente', 'executando', 'feito', 'erro');

-- Uma ponte por pessoa. `visto_em` é atualizado a cada poucos segundos enquanto ela está ligada.
create table pontes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  nome text not null default '',
  pasta text not null default '',
  visto_em timestamptz not null default now()
);

-- Pedidos do servidor para a ponte de uma pessoa (ler, listar ou gravar arquivo).
create table tarefas_locais (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  ficha_id uuid not null references fichas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ferramenta text not null,
  args jsonb not null default '{}',
  estado estado_local not null default 'pendente',
  resultado text,
  criado_em timestamptz not null default now()
);
create index tarefas_locais_fila_idx on tarefas_locais(user_id, estado);

alter table pontes enable row level security;
create policy pontes_ler on pontes for select using (tenho_papel(escritorio_id, 'leitor'));
create policy pontes_criar on pontes for insert with check (user_id = auth.uid() and tenho_papel(escritorio_id, 'operador'));
create policy pontes_atualizar on pontes for update using (user_id = auth.uid()) with check (user_id = auth.uid() and tenho_papel(escritorio_id, 'operador'));
create policy pontes_apagar on pontes for delete using (user_id = auth.uid());

-- Só o servidor cria tarefas. A ponte só enxerga e responde as da própria pessoa.
alter table tarefas_locais enable row level security;
create policy tarefas_locais_ler on tarefas_locais for select using (user_id = auth.uid());
create policy tarefas_locais_responder on tarefas_locais for update
  using (user_id = auth.uid() and estado in ('pendente', 'executando'))
  with check (user_id = auth.uid() and estado in ('executando', 'feito', 'erro'));

alter publication supabase_realtime add table tarefas_locais, pontes;
