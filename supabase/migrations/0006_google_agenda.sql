begin;
-- Apenas o servidor pode ler credenciais e estados OAuth de uso único.
create table public.google_conexoes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  refresh_token text not null,
  atualizado_em timestamptz not null default now()
);
create table public.google_oauth_estados (
  hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expira_em timestamptz not null
);
alter table public.google_conexoes enable row level security;
alter table public.google_oauth_estados enable row level security;
revoke all on public.google_conexoes, public.google_oauth_estados from anon, authenticated;
grant all on public.google_conexoes, public.google_oauth_estados to service_role;
alter table public.reunioes add column google_event_id text unique;
alter table public.reunioes add column google_calendar_email text;
alter table public.reunioes add column convidados uuid[] not null default '{}';
-- Um agendamento pendente é persistido antes de chamar o Google, permitindo retentativa sem duplicar convites.
alter table public.reunioes add column sincronizacao text not null default 'local' check (sincronizacao in ('local','pendente','pronta'));
revoke insert on public.reunioes from authenticated;
grant insert(escritorio_id,criado_por,titulo,pauta,inicio,fim,link) on public.reunioes to authenticated;
-- Cancelamentos Google passam pelo servidor para também atualizar os convidados.
drop policy reunioes_cancelar on public.reunioes;
create policy reunioes_cancelar on public.reunioes for update to authenticated
  using (public.tenho_papel(escritorio_id,'leitor') and criado_por = auth.uid() and google_event_id is null)
  with check (public.tenho_papel(escritorio_id,'leitor') and criado_por = auth.uid() and google_event_id is null);
commit;
