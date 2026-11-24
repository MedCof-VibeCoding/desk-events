-- Fila em segundo plano: os agentes trabalham sem o site ficar esperando, retomam sozinhos
-- quando o servidor cai no meio, e esperam o computador sem ocupar o servidor.
-- Execute após 0009_travar_aprovacoes.sql. Depois, rode supabase/configurar_fila.sql uma vez.

-- Novo estado: a ficha mandou um pedido para a ponte local e espera a resposta.
-- (Fora da transação: um valor novo de enum precisa estar gravado antes de ser usado.)
alter type public.estado_ficha add value if not exists 'aguardando_computador';

begin;

-- Reserva de trabalho: enquanto `trabalhando_ate` não passa, só uma execução mexe na ficha.
-- Se o servidor cair, a reserva vence e a ficha volta a ser pega sozinha.
alter table public.fichas add column if not exists trabalhando_ate timestamptz;
alter table public.fichas add column if not exists voltas int not null default 0;
create index if not exists fichas_pegar_idx on public.fichas(estado, criado_em) where estado in ('fila', 'trabalhando');

-- Cada pedido para a ponte guarda de qual chamada do agente veio, para a retomada achar a resposta.
alter table public.tarefas_locais add column if not exists chamada_id text;
create index if not exists tarefas_locais_chamada_idx on public.tarefas_locais(ficha_id, chamada_id);

-- Pega até `limite` fichas para trabalhar (ou só a ficha `so`). Uso exclusivo do servidor.
create or replace function public.pegar_fichas(limite int, so uuid default null)
returns table(id uuid)
language plpgsql security definer set search_path = public as $$
begin
  -- Ficha que já foi retomada vezes demais provavelmente está em laço: para com erro.
  update public.fichas f set estado = 'erro', resultado = 'A ficha foi retomada vezes demais sem terminar. Confira o histórico e tente de novo.', trabalhando_ate = null
    where f.voltas >= 50 and (f.estado = 'fila' or (f.estado = 'trabalhando' and coalesce(f.trabalhando_ate, f.atualizado_em + interval '6 minutes') < now()))
      and (so is null or f.id = so);
  return query
    update public.fichas f set estado = 'trabalhando', trabalhando_ate = now() + interval '5 minutes', voltas = f.voltas + 1
    where f.id in (
      select x.id from public.fichas x
      join public.escritorios e on e.id = x.escritorio_id and not e.pausado
      where (x.estado = 'fila' or (x.estado = 'trabalhando' and coalesce(x.trabalhando_ate, x.atualizado_em + interval '6 minutes') < now()))
        and (so is null or x.id = so)
      order by x.criado_em
      limit greatest(limite, 0)
      for update of x skip locked)
    returning f.id;
end $$;
revoke all on function public.pegar_fichas(int, uuid) from public, anon, authenticated;
grant execute on function public.pegar_fichas(int, uuid) to service_role;

-- Acorda o servidor de agentes (POST em /api/fila). O endereço e o segredo ficam no Vault,
-- gravados por supabase/configurar_fila.sql. Sem essa configuração, não faz nada.
create or replace function public.acordar_fila() returns void
language plpgsql security definer set search_path = public as $$
declare url text; segredo text;
begin
  select decrypted_secret into url from vault.decrypted_secrets where name = 'deskcof_fila_url';
  select decrypted_secret into segredo from vault.decrypted_secrets where name = 'deskcof_fila_segredo';
  if url is null or segredo is null then return; end if;
  perform net.http_post(url := url, body := '{}'::jsonb, timeout_milliseconds := 5000,
    headers := jsonb_build_object('authorization', 'Bearer ' || segredo, 'content-type', 'application/json'));
exception when others then
  -- Vault ou pg_net ainda não configurados: a fila continua sendo atendida pelo servidor.
  return;
end $$;
revoke all on function public.acordar_fila() from public, anon, authenticated;

-- Quando a ponte responde o último pedido pendente de uma ficha que esperava o computador,
-- a ficha volta para a fila e o servidor é acordado.
create or replace function public.tarefa_local_respondida() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado in ('feito', 'erro') and old.estado is distinct from new.estado
     and not exists (select 1 from public.tarefas_locais t where t.ficha_id = new.ficha_id and t.id <> new.id and t.estado in ('pendente', 'executando')) then
    update public.fichas set estado = 'fila', trabalhando_ate = null where id = new.ficha_id and estado = 'aguardando_computador';
    if found then perform public.acordar_fila(); end if;
  end if;
  return new;
end $$;
drop trigger if exists tarefa_local_respondida on public.tarefas_locais;
create trigger tarefa_local_respondida after update on public.tarefas_locais
  for each row execute function public.tarefa_local_respondida();

-- Cancelar também vale para ficha esperando o computador.
create or replace function public.cancelar_ficha(ficha uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f record;
begin
  select escritorio_id, estado into f from public.fichas where id = ficha for update;
  if not found or not public.tenho_papel(f.escritorio_id, 'operador') then
    raise exception 'Ficha não encontrada ou seu papel não permite essa ação.' using errcode = '42501';
  end if;
  if f.estado::text not in ('fila', 'trabalhando', 'aguardando_aprovacao', 'aguardando_computador', 'erro') then
    raise exception 'Esta ficha já foi encerrada.';
  end if;
  update public.fichas set estado = 'cancelada', trabalhando_ate = null where id = ficha;
  update public.aprovacoes set estado = 'recusada', comentario = 'Ficha cancelada.', decidido_por = auth.uid(), decidido_em = now()
    where ficha_id = ficha and estado = 'pendente';
  update public.tarefas_locais set estado = 'erro', resultado = 'Ficha cancelada.'
    where ficha_id = ficha and estado = 'pendente';
end $$;

-- Tentar de novo: com a reserva, uma ficha só conta como presa depois que a reserva vence.
create or replace function public.retomar_ficha(ficha uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f record;
begin
  select escritorio_id, estado, atualizado_em, trabalhando_ate into f from public.fichas where id = ficha for update;
  if not found or not public.tenho_papel(f.escritorio_id, 'operador') then
    raise exception 'Ficha não encontrada ou seu papel não permite essa ação.' using errcode = '42501';
  end if;
  if f.estado = 'fila' then return; end if;
  if f.estado = 'trabalhando' and coalesce(f.trabalhando_ate, f.atualizado_em + interval '6 minutes') > now() then
    raise exception 'O agente ainda está trabalhando nesta ficha. Se ela continuar parada, tente de novo em alguns minutos.';
  end if;
  if f.estado not in ('erro', 'trabalhando') then
    raise exception 'Só dá para tentar de novo uma ficha com erro ou parada.';
  end if;
  update public.fichas set estado = 'fila', resultado = null, trabalhando_ate = null, voltas = 0 where id = ficha;
end $$;

commit;
