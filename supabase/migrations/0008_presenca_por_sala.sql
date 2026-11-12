-- Presença por pessoa e por sala. Execute após 0007_salas_e_skills.sql.
-- Antes, uma pessoa com duas abas em salas diferentes tinha uma presença só, e as abas
-- se sobrescreviam: o avatar sumia do escritório principal.
begin;

alter table public.presencas drop constraint presencas_pkey;
alter table public.presencas add primary key (user_id, escritorio_id);

create or replace function public.marcar_presenca(sala uuid, area text, instancia uuid) returns void
language plpgsql security definer set search_path = public as $$
declare lugar int; px real; pz real;
begin
  if not public.tenho_papel(sala,'leitor') then raise exception 'Sem acesso à sala.' using errcode = '42501'; end if;
  if area not in ('geral','reuniao','cafe') or instancia is null then raise exception 'Presença inválida.'; end if;
  lugar := (abs(hashtextextended(auth.uid()::text, 0) % 12))::int;
  px := case area when 'cafe' then 2.4 + (lugar % 6) * 1.05 when 'reuniao' then -8.7 + (lugar % 6) * 1.05 else -7.5 + (lugar % 6) * 2.7 end;
  pz := case area when 'geral' then 6.6 + (lugar / 6) * 0.7 else -3.2 - (lugar / 6) * 0.7 end;
  insert into public.presencas(user_id,escritorio_id,sessao,zona,x,z,visto_em) values(auth.uid(),sala,instancia,area,px,pz,now())
    on conflict(user_id, escritorio_id) do update set sessao = excluded.sessao, zona = excluded.zona, x = excluded.x, z = excluded.z, visto_em = now();
  -- Faxina: presenças abandonadas há mais de 10 minutos.
  delete from public.presencas where visto_em < now() - interval '10 minutes';
end $$;

-- Abas em segundo plano espaçam o batimento; 150 segundos evita o avatar sumir à toa.
create or replace function public.falar_cafe(sala uuid, mensagem text, para uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare msg uuid;
begin
  if not public.tenho_papel(sala,'leitor') or not exists(select 1 from public.presencas where user_id = auth.uid() and escritorio_id = sala and zona = 'cafe' and visto_em > now() - interval '150 seconds') then
    raise exception 'Entre no café para conversar.' using errcode = '42501';
  end if;
  if para is not null and not exists(select 1 from public.presencas where user_id = para and escritorio_id = sala and zona = 'cafe' and visto_em > now() - interval '150 seconds') then raise exception 'Essa pessoa saiu do café.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 1));
  if exists(select 1 from public.mensagens_cafe where user_id = auth.uid() and criado_em > now() - interval '1 second') then raise exception 'Aguarde um instante antes de enviar outra mensagem.'; end if;
  insert into public.mensagens_cafe(escritorio_id,user_id,destinatario,texto) values(sala,auth.uid(),para,trim(mensagem)) returning id into msg;
  return msg;
end $$;

revoke all on function public.marcar_presenca(uuid,text,uuid), public.falar_cafe(uuid,text,uuid) from public, anon;
grant execute on function public.marcar_presenca(uuid,text,uuid), public.falar_cafe(uuid,text,uuid) to authenticated;
commit;
