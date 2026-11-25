-- Decoração compartilhada, isolada por sala, com controle de concorrência.
begin;
create table public.ambientes_escritorio (
  escritorio_id uuid primary key references public.escritorios(id) on delete cascade,
  layout jsonb not null,
  revisao integer not null default 1 check (revisao > 0),
  atualizado_por uuid references auth.users(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  check (jsonb_typeof(layout) = 'object' and octet_length(layout::text) <= 50000)
);
alter table public.ambientes_escritorio enable row level security;
revoke all on public.ambientes_escritorio from public, anon, authenticated;
grant select on public.ambientes_escritorio to authenticated;
grant all on public.ambientes_escritorio to service_role;
create policy ambientes_ler on public.ambientes_escritorio for select to authenticated
  using (public.tenho_papel(escritorio_id, 'leitor'));

create function public.salvar_ambiente(sala uuid, conteudo jsonb, revisao_esperada integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  atual integer;
  item jsonb;
  ids text[] := '{}';
  slots integer[] := '{}';
  tipos text[] := array['posto','mesa-carvalho','mesa-branca','mesa-preta','mesa-l','mesa-alta','bancada-dupla','ilha','recepcao','cadeira-vermelha','cadeira-preta','cadeira-creme','cadeira-azul','poltrona','sofa-grafite','sofa-creme','banqueta','mesa-reuniao','mesa-redonda','mesa-centro-redonda','mesa-centro','estante','armario-baixo','arquivo','locker','copa','geladeira','bebedouro','quadro','tv','divisoria-madeira','divisoria-vidro','divisoria-acustica','planta-grande','samambaia','suculenta','luminaria','luminaria-mesa','tapete-retangular','tapete-redondo','arte','monitor','notebook','microfone','camera','caixa-som','cabideiro','lixeira','impressora'];
begin
  if not public.tenho_papel(sala, 'editor') then
    raise exception 'Você não pode decorar esta sala.' using errcode='42501';
  end if;
  if conteudo is null or jsonb_typeof(conteudo) <> 'object' or octet_length(conteudo::text)>50000
    or (conteudo->'versao') is distinct from '1'::jsonb
    or not coalesce(conteudo->>'estilo' = any(array['classico','industrial','jardim','minimalista','executivo','tech','criativo','cafe','biblioteca','estudio']),false)
    or jsonb_typeof(conteudo->'itens') is distinct from 'array' then
    raise exception 'Ambiente inválido.' using errcode='22023';
  end if;
  if jsonb_array_length(conteudo->'itens') not between 12 and 100 then
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
    if (item->>'x')::numeric not between -10.2 and 10.2
      or (item->>'z')::numeric not between -7.35 and 7.7
      or (item->>'giro')::numeric not in (0,1,2,3) then
      raise exception 'Posição inválida.' using errcode='22023';
    end if;
    ids := array_append(ids,item->>'id');
    if item->>'tipo' = 'posto' then
      if jsonb_typeof(item->'slot') is distinct from 'number'
        or not coalesce((item->>'slot') ~ '^(0|[1-9]|10|11)$',false)
        or (item->>'slot')::integer = any(slots) then
        raise exception 'Estação inválida.' using errcode='22023';
      end if;
      slots := array_append(slots,(item->>'slot')::integer);
    end if;
  end loop;
  if cardinality(slots) <> 12 then raise exception 'Mantenha as 12 estações dos agentes.' using errcode='22023'; end if;
  -- Serializa inclusive duas primeiras gravações concorrentes da mesma sala.
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
revoke all on function public.salvar_ambiente(uuid,jsonb,integer) from public,anon;
grant execute on function public.salvar_ambiente(uuid,jsonb,integer) to authenticated;
alter publication supabase_realtime add table public.ambientes_escritorio;
commit;
