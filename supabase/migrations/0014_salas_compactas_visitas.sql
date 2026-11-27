-- Salas pessoais compactas e visitas autorizadas pelo dono.
begin;

create table public.pedidos_visita (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  solicitante uuid not null references public.perfis(user_id) on delete cascade,
  estado text not null check (estado in ('pendente', 'recusado')),
  criado_em timestamptz not null default now(),
  decidido_em timestamptz
);
create unique index pedidos_visita_pessoa on public.pedidos_visita(escritorio_id, solicitante);
create index pedidos_visita_pendentes on public.pedidos_visita(escritorio_id) where estado = 'pendente';
alter table public.pedidos_visita enable row level security;
create policy pedidos_visita_ler on public.pedidos_visita for select to authenticated
  using (
    solicitante = auth.uid()
    or exists (select 1 from public.escritorios e where e.id = escritorio_id and e.criado_por = auth.uid())
  );
revoke all on public.pedidos_visita from anon, authenticated;
grant select on public.pedidos_visita to authenticated;
grant all on public.pedidos_visita to service_role;

-- Diretório público das salas pessoais: nome e dono, mais o acesso de quem consulta.
create function public.listar_salas_vitrine()
returns table (
  id uuid,
  nome text,
  dono_id uuid,
  dono_nome text,
  papel public.papel,
  pedido text,
  pedidos_pendentes integer
)
language sql stable security definer set search_path = public as $$
  select e.id,
    e.nome,
    e.criado_por,
    coalesce(nullif(trim(p.nome), ''), 'Sala'),
    m.papel,
    v.estado,
    case when e.criado_por = auth.uid()
      then (select count(*)::integer from public.pedidos_visita pv where pv.escritorio_id = e.id and pv.estado = 'pendente')
      else 0 end
  from public.escritorios e
  join public.perfis p on p.user_id = e.criado_por
  left join public.membros m on m.escritorio_id = e.id and m.user_id = auth.uid()
  left join public.pedidos_visita v on v.escritorio_id = e.id and v.solicitante = auth.uid()
  where e.pessoal and auth.uid() is not null
  order by 4, e.nome;
$$;

-- Pedidos pendentes da sala pessoal de quem está logado.
create function public.listar_pedidos_visita()
returns table (id uuid, escritorio_id uuid, solicitante uuid, nome text, criado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select v.id, v.escritorio_id, v.solicitante, coalesce(nullif(trim(p.nome), ''), 'Alguém'), v.criado_em
  from public.pedidos_visita v
  join public.escritorios e on e.id = v.escritorio_id
  join public.perfis p on p.user_id = v.solicitante
  where v.estado = 'pendente' and e.criado_por = auth.uid()
  order by v.criado_em;
$$;

-- Abre ou reabre um pedido. Quem já é membro entra sem pedir.
create function public.pedir_visita(sala uuid) returns void
language plpgsql security definer set search_path = public as $$
declare dono uuid;
begin
  if auth.uid() is null or not public.perfil_pronto() then
    raise exception 'Complete seu perfil antes de pedir uma visita.' using errcode = '42501';
  end if;
  select criado_por into dono from public.escritorios where id = sala and pessoal;
  if dono is null then
    raise exception 'Essa sala não recebe visitas.' using errcode = '22023';
  end if;
  if dono = auth.uid() then
    raise exception 'Esta sala já é sua.' using errcode = '22023';
  end if;
  if exists(select 1 from public.membros where escritorio_id = sala and user_id = auth.uid()) then
    raise exception 'Você já pode entrar nesta sala.' using errcode = '22023';
  end if;
  insert into public.pedidos_visita(escritorio_id, solicitante, estado)
    values (sala, auth.uid(), 'pendente')
    on conflict (escritorio_id, solicitante) do update
      set estado = 'pendente', criado_em = now(), decidido_em = null
      where public.pedidos_visita.estado is distinct from 'pendente';
end $$;

-- O dono aceita (visitante leitor) ou recusa. Não reduz um papel que já exista.
create function public.decidir_visita(pedido uuid, aceitar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare ped public.pedidos_visita%rowtype;
begin
  select * into ped from public.pedidos_visita where id = pedido and estado = 'pendente';
  if not found then
    raise exception 'Esse pedido não está mais pendente.' using errcode = '22023';
  end if;
  if not public.tenho_papel(ped.escritorio_id, 'dono') then
    raise exception 'Só o dono autoriza visitas.' using errcode = '42501';
  end if;
  if coalesce(aceitar, false) then
    insert into public.membros(escritorio_id, user_id, papel)
      values (ped.escritorio_id, ped.solicitante, 'leitor')
      on conflict (escritorio_id, user_id) do nothing;
    delete from public.pedidos_visita where id = pedido;
  else
    update public.pedidos_visita set estado = 'recusado', decidido_em = now() where id = pedido;
  end if;
end $$;

revoke all on function public.listar_salas_vitrine(), public.listar_pedidos_visita(), public.pedir_visita(uuid), public.decidir_visita(uuid, boolean) from public, anon;
grant execute on function public.listar_salas_vitrine(), public.listar_pedidos_visita(), public.pedir_visita(uuid), public.decidir_visita(uuid, boolean) to authenticated;

-- Sala pessoal: no máximo 6 estações e móveis dentro do piso menor.
create or replace function public.salvar_ambiente(sala uuid, conteudo jsonb, revisao_esperada integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  atual integer;
  item jsonb;
  ids text[] := '{}';
  slots integer[] := '{}';
  eh_pessoal boolean := false;
  x_min numeric := -10.2;
  x_max numeric := 10.2;
  z_min numeric := -7.35;
  z_max numeric := 7.7;
  limite integer := 12;
  tipos text[] := array['posto','mesa-carvalho','mesa-branca','mesa-preta','mesa-l','mesa-alta','bancada-dupla','ilha','recepcao','cadeira-vermelha','cadeira-preta','cadeira-creme','cadeira-azul','poltrona','sofa-grafite','sofa-creme','banqueta','mesa-reuniao','mesa-redonda','mesa-centro-redonda','mesa-centro','estante','armario-baixo','arquivo','locker','copa','geladeira','bebedouro','quadro','tv','divisoria-madeira','divisoria-vidro','divisoria-acustica','planta-grande','samambaia','suculenta','luminaria','luminaria-mesa','tapete-retangular','tapete-redondo','arte','monitor','notebook','microfone','camera','caixa-som','cabideiro','lixeira','impressora'];
begin
  if not public.tenho_papel(sala, 'editor') then
    raise exception 'Você não pode decorar esta sala.' using errcode='42501';
  end if;
  select pessoal into eh_pessoal from public.escritorios where id = sala;
  if coalesce(eh_pessoal, false) then
    x_min := -6.4; x_max := 6.4; z_min := -4.8; z_max := 5.2; limite := 6;
  end if;
  if conteudo is null or jsonb_typeof(conteudo) <> 'object' or octet_length(conteudo::text)>50000
    or (conteudo->'versao') is distinct from '1'::jsonb
    or not coalesce(conteudo->>'estilo' = any(array['classico','industrial','jardim','minimalista','executivo','tech','criativo','cafe','biblioteca','estudio']),false)
    or jsonb_typeof(conteudo->'itens') is distinct from 'array' then
    raise exception 'Ambiente inválido.' using errcode='22023';
  end if;
  if jsonb_array_length(conteudo->'itens') not between 0 and 100 then
    raise exception 'Quantidade de móveis inválida.' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(conteudo->'itens') loop
    if jsonb_typeof(item) <> 'object'
      or not coalesce((item->>'id') ~ '^[a-zA-Z0-9-]{1,80}$',false)
      or (item->>'id') = any(ids)
      or not coalesce((item->>'tipo') = any(tipos),false)
      or jsonb_typeof(item->'x') is distinct from 'number'
      or jsonb_typeof(item->'z') is distinct from 'number'
      or jsonb_typeof(item->'giro') is distinct from 'number' then
      raise exception 'Móvel inválido.' using errcode='22023';
    end if;
    if (item->>'x')::numeric not between x_min and x_max
      or (item->>'z')::numeric not between z_min and z_max
      or (item->>'giro')::numeric not in (0,1,2,3) then
      raise exception 'Posição inválida.' using errcode='22023';
    end if;
    ids := array_append(ids,item->>'id');
    if item->>'tipo' = 'posto' then
      if jsonb_typeof(item->'slot') is distinct from 'number'
        or (eh_pessoal and not coalesce((item->>'slot') ~ '^[0-5]$',false))
        or (not eh_pessoal and not coalesce((item->>'slot') ~ '^(0|[1-9]|10|11)$',false))
        or (item->>'slot')::integer = any(slots) then
        raise exception 'Estação inválida.' using errcode='22023';
      end if;
      slots := array_append(slots,(item->>'slot')::integer);
    end if;
  end loop;
  if cardinality(slots) > limite then raise exception 'Há estações demais.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(sala::text,0));
  select revisao into atual from public.ambientes_escritorio where escritorio_id=sala;
  if revisao_esperada is null or coalesce(atual,0) <> revisao_esperada then
    raise exception 'A sala foi alterada por outra pessoa.' using errcode='40001';
  end if;
  atual := coalesce(atual,0)+1;
  insert into public.ambientes_escritorio(escritorio_id,layout,revisao,atualizado_por)
    values(sala,conteudo,atual,auth.uid())
    on conflict(escritorio_id) do update set layout=excluded.layout,revisao=excluded.revisao,atualizado_por=excluded.atualizado_por,atualizado_em=now();
  return atual;
end $$;

alter publication supabase_realtime add table public.pedidos_visita;
commit;
