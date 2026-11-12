-- Desk Events: executar uma vez no SQL Editor, após as migrações 0001–0003.
-- Atualização atômica: qualquer erro reverte todas as alterações.
begin;
-- Fonte: 0004_colaboracao.sql
-- Conversas da equipe e agenda do escritório. Execute após 0003_ponte_local.sql.

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


-- Fonte: 0005_usuarios_salas.sql
-- Identidade pessoal, salas privadas, escritório principal e café.

create table public.perfis (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '' check (char_length(nome) <= 80),
  aparencia jsonb,
  admin_geral boolean not null default false,
  criado_em timestamptz not null default now(),
  check (aparencia is null or coalesce((
    jsonb_typeof(aparencia) = 'object' and
    aparencia ?& array['personagem','versao','look','cor'] and
    aparencia->>'personagem' in ('atlas','pixel','ritmo','foco','elo','byte') and
    aparencia->>'versao' in ('m','f') and
    aparencia->>'look' in ('casual','escritorio','evento') and
    aparencia->>'cor' ~ '^#[0-9a-fA-F]{6}$'
  ), false))
);
alter table public.perfis enable row level security;
create policy perfis_ler on public.perfis for select to authenticated using (true);
create policy perfis_editar on public.perfis for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.perfis from anon, authenticated;
grant select on public.perfis to authenticated;
grant all on public.perfis to service_role;
grant update(nome, aparencia) on public.perfis to authenticated;

alter table public.escritorios add column principal boolean not null default false;
create unique index escritorio_principal_unico on public.escritorios(principal) where principal;

create function public.perfil_pronto() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.perfis p join auth.users u on u.id = p.user_id
    where p.user_id = auth.uid() and p.aparencia is not null and length(trim(p.nome)) > 0 and u.email_confirmed_at is not null)
$$;
create function public.sou_admin_geral() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from auth.users where id = auth.uid()
    and lower(email) = 'uilian.sabadi@grupomedcof.com.br' and email_confirmed_at is not null)
$$;

-- Não usa metadados informados pelo cliente para conceder administração.
create function public.sincronizar_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare administrador boolean; sala uuid;
begin
  administrador := lower(new.email) = 'uilian.sabadi@grupomedcof.com.br' and new.email_confirmed_at is not null;
  insert into public.perfis(user_id, admin_geral) values(new.id, coalesce(administrador, false))
    on conflict(user_id) do update set admin_geral = excluded.admin_geral;
  if administrador then
    perform pg_advisory_xact_lock(513902);
    select id into sala from public.escritorios where principal;
    if sala is null then
      select id into sala from public.escritorios where criado_por = new.id order by criado_em limit 1;
      if sala is null then
        insert into public.escritorios(nome, criado_por, principal) values('Escritório principal', new.id, true) returning id into sala;
      else
        update public.escritorios set principal = true where id = sala;
      end if;
    end if;
    insert into public.membros(escritorio_id, user_id, papel) values(sala, new.id, 'dono')
      on conflict(escritorio_id, user_id) do update set papel = 'dono';
  end if;
  return new;
end $$;
create trigger perfil_auth after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.sincronizar_perfil();
insert into public.perfis(user_id, admin_geral)
  select id, coalesce(lower(email) = 'uilian.sabadi@grupomedcof.com.br' and email_confirmed_at is not null, false) from auth.users;
-- Aciona o mesmo bootstrap para o administrador já cadastrado, sem alterar sua conta.
update auth.users set email = email where lower(email) = 'uilian.sabadi@grupomedcof.com.br';

create or replace function public.meu_papel(esc uuid) returns public.papel
language sql stable security definer set search_path = public as $$
  select case when public.perfil_pronto() then coalesce(
    (select papel from public.membros where escritorio_id = esc and user_id = auth.uid()),
    (select 'leitor'::public.papel from public.escritorios where id = esc and principal)
  ) end
$$;
-- Admin geral continua sujeito à associação na sala: não há bypass de RLS.
drop policy escritorios_criar on public.escritorios;
create policy escritorios_criar on public.escritorios for insert to authenticated
  with check (public.perfil_pronto() and criado_por = auth.uid() and not principal);
revoke insert, update on public.escritorios from authenticated;
grant insert(nome) on public.escritorios to authenticated;
grant update(nome, pausado, teto_mes_usd) on public.escritorios to authenticated;
drop policy escritorios_apagar on public.escritorios;
create policy escritorios_apagar on public.escritorios for delete to authenticated using (not principal and public.tenho_papel(id, 'dono'));

revoke insert, update, delete on public.membros from authenticated;
create function public.gerir_membro(sala uuid, pessoa uuid, novo_papel public.papel default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.tenho_papel(sala, 'dono') or (public.sou_admin_geral() and public.tenho_papel(sala, 'leitor'))) then
    raise exception 'Você não pode gerenciar o acesso a esta sala.' using errcode = '42501';
  end if;
  if exists(select 1 from public.escritorios where id = sala and criado_por = pessoa) then
    raise exception 'O proprietário deve continuar como dono da sala.';
  end if;
  if not exists(select 1 from public.perfis where user_id = pessoa and aparencia is not null and length(trim(nome)) > 0) then
    raise exception 'Essa pessoa ainda não criou seu avatar.';
  end if;
  if novo_papel is null then delete from public.membros where escritorio_id = sala and user_id = pessoa;
  else
    insert into public.membros(escritorio_id,user_id,papel) values(sala,pessoa,novo_papel)
      on conflict(escritorio_id,user_id) do update set papel = excluded.papel;
  end if;
end $$;

create table public.presencas (
  user_id uuid primary key references public.perfis(user_id) on delete cascade,
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  sessao uuid not null,
  zona text not null check (zona in ('geral','reuniao','cafe')),
  x real not null, z real not null,
  visto_em timestamptz not null default now()
);
create index presencas_sala on public.presencas(escritorio_id, visto_em);
alter table public.presencas enable row level security;
create policy presencas_ler on public.presencas for select to authenticated using (public.tenho_papel(escritorio_id,'leitor'));
revoke all on public.presencas from anon, authenticated;
grant select on public.presencas to authenticated;
grant all on public.presencas to service_role;
create function public.marcar_presenca(sala uuid, area text, instancia uuid) returns void
language plpgsql security definer set search_path = public as $$
declare lugar int; px real; pz real;
begin
  if not public.tenho_papel(sala,'leitor') then raise exception 'Sem acesso à sala.' using errcode = '42501'; end if;
  if area not in ('geral','reuniao','cafe') or instancia is null then raise exception 'Presença inválida.'; end if;
  lugar := (abs(hashtextextended(auth.uid()::text, 0) % 12))::int;
  px := case area when 'cafe' then 2.4 + (lugar % 6) * 1.05 when 'reuniao' then -8.7 + (lugar % 6) * 1.05 else -7.5 + (lugar % 6) * 2.7 end;
  pz := case area when 'geral' then 6.6 + (lugar / 6) * 0.7 else -3.2 - (lugar / 6) * 0.7 end;
  insert into public.presencas(user_id,escritorio_id,sessao,zona,x,z,visto_em) values(auth.uid(),sala,instancia,area,px,pz,now())
    on conflict(user_id) do update set escritorio_id = excluded.escritorio_id, sessao = excluded.sessao, zona = excluded.zona, x = excluded.x, z = excluded.z, visto_em = now();
end $$;
create function public.sair_sala(instancia uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.presencas where user_id = auth.uid() and sessao = instancia
$$;

create table public.mensagens_cafe (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  user_id uuid not null references public.perfis(user_id) on delete cascade,
  destinatario uuid references public.perfis(user_id) on delete cascade,
  texto text not null check(char_length(trim(texto)) between 1 and 280),
  criado_em timestamptz not null default now()
);
create index cafe_sala_data on public.mensagens_cafe(escritorio_id, criado_em desc);
alter table public.mensagens_cafe enable row level security;
create policy cafe_ler on public.mensagens_cafe for select to authenticated using (
  public.tenho_papel(escritorio_id,'leitor') and (destinatario is null or auth.uid() in (user_id,destinatario))
);
revoke all on public.mensagens_cafe from anon, authenticated;
grant select on public.mensagens_cafe to authenticated;
grant all on public.mensagens_cafe to service_role;
create function public.falar_cafe(sala uuid, mensagem text, para uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare msg uuid;
begin
  if not public.tenho_papel(sala,'leitor') or not exists(select 1 from public.presencas where user_id = auth.uid() and escritorio_id = sala and zona = 'cafe' and visto_em > now() - interval '70 seconds') then
    raise exception 'Entre no café para conversar.' using errcode = '42501';
  end if;
  if para is not null and not exists(select 1 from public.presencas where user_id = para and escritorio_id = sala and zona = 'cafe' and visto_em > now() - interval '70 seconds') then raise exception 'Essa pessoa saiu do café.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 1));
  if exists(select 1 from public.mensagens_cafe where user_id = auth.uid() and criado_em > now() - interval '1 second') then raise exception 'Aguarde um instante antes de enviar outra mensagem.'; end if;
  insert into public.mensagens_cafe(escritorio_id,user_id,destinatario,texto) values(sala,auth.uid(),para,trim(mensagem)) returning id into msg;
  return msg;
end $$;

-- A colaboração entre pessoas não concede operação dos agentes da sala.
drop policy mensagens_equipe_enviar on public.mensagens_equipe;
create policy mensagens_equipe_enviar on public.mensagens_equipe for insert to authenticated
  with check (public.tenho_papel(escritorio_id,'leitor') and criado_por = auth.uid());
drop policy reunioes_criar on public.reunioes;
create policy reunioes_criar on public.reunioes for insert to authenticated
  with check (public.tenho_papel(escritorio_id,'leitor') and criado_por = auth.uid());
drop policy reunioes_cancelar on public.reunioes;
create policy reunioes_cancelar on public.reunioes for update to authenticated
  using (public.tenho_papel(escritorio_id,'leitor') and criado_por = auth.uid())
  with check (public.tenho_papel(escritorio_id,'leitor') and criado_por = auth.uid());

alter publication supabase_realtime add table public.perfis, public.presencas, public.mensagens_cafe, public.membros;
revoke all on function public.perfil_pronto(), public.sou_admin_geral(), public.sincronizar_perfil(), public.gerir_membro(uuid,uuid,public.papel), public.marcar_presenca(uuid,text,uuid), public.sair_sala(uuid), public.falar_cafe(uuid,text,uuid) from public, anon;
grant execute on function public.perfil_pronto(), public.sou_admin_geral(), public.gerir_membro(uuid,uuid,public.papel), public.marcar_presenca(uuid,text,uuid), public.sair_sala(uuid), public.falar_cafe(uuid,text,uuid) to authenticated;


-- Fonte: 0006_google_agenda.sql

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

notify pgrst, 'reload schema';
commit;
