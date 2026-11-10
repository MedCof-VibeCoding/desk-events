-- Conversas da equipe e agenda do escritório. Execute após 0003_ponte_local.sql.
begin;

create table public.mensagens_equipe (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  criado_por uuid not null default auth.uid() references auth.users(id),
  autor text not null check (char_length(autor) between 1 and 80),
  canal text not null default 'geral' check (canal in ('geral', 'eventos', 'operacao')),
  texto text not null check (char_length(trim(texto)) between 1 and 4000),
  criado_em timestamptz not null default now()
);
create index mensagens_equipe_canal_idx on public.mensagens_equipe(escritorio_id, canal, criado_em desc);
alter table public.mensagens_equipe enable row level security;
create policy mensagens_equipe_ler on public.mensagens_equipe for select to authenticated
  using (public.tenho_papel(escritorio_id, 'leitor'));
create policy mensagens_equipe_enviar on public.mensagens_equipe for insert to authenticated
  with check (public.tenho_papel(escritorio_id, 'operador') and criado_por = auth.uid());
revoke all on public.mensagens_equipe from anon, authenticated;
grant select, insert on public.mensagens_equipe to authenticated;

create table public.reunioes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  criado_por uuid not null default auth.uid() references auth.users(id),
  titulo text not null check (char_length(trim(titulo)) between 1 and 120),
  pauta text not null default '' check (char_length(pauta) <= 4000),
  inicio timestamptz not null,
  fim timestamptz not null,
  link text not null check (link ~ '^https://[^[:space:]]+$' and char_length(link) <= 2048),
  estado text not null default 'agendada' check (estado in ('agendada', 'cancelada')),
  criado_em timestamptz not null default now(),
  check (fim > inicio)
);
create index reunioes_agenda_idx on public.reunioes(escritorio_id, inicio);
alter table public.reunioes enable row level security;
create policy reunioes_ler on public.reunioes for select to authenticated
  using (public.tenho_papel(escritorio_id, 'leitor'));
create policy reunioes_criar on public.reunioes for insert to authenticated
  with check (public.tenho_papel(escritorio_id, 'operador') and criado_por = auth.uid());
create policy reunioes_cancelar on public.reunioes for update to authenticated
  using (public.tenho_papel(escritorio_id, 'editor') or (public.tenho_papel(escritorio_id, 'operador') and criado_por = auth.uid()))
  with check (public.tenho_papel(escritorio_id, 'editor') or (public.tenho_papel(escritorio_id, 'operador') and criado_por = auth.uid()));
revoke all on public.reunioes from anon, authenticated;
grant select, insert on public.reunioes to authenticated;
grant update(estado) on public.reunioes to authenticated;

alter publication supabase_realtime add table public.mensagens_equipe, public.reunioes;
commit;
