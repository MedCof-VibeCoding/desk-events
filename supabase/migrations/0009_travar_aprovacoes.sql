-- Fecha o atalho que permitia aprovar ações no computador de outra pessoa.
-- Execute após 0008_presenca_por_sala.sql.
--
-- Antes: qualquer operador da sala podia gravar direto nas tabelas `aprovacoes` e `fichas`
-- (pelo navegador, sem passar pelo servidor). Com isso dava para aprovar um comando no
-- computador de um colega, devolver a ficha para a fila e até trocar o responsável da ficha.
-- Agora: decisões só pelo servidor (/api/decidir), fichas só mudam por funções com regras,
-- e o banco confere a aprovação antes de mandar um comando para a ponte local.
begin;

-- ---------- aprovações: só o servidor decide ----------
drop policy if exists aprovacoes_decidir on public.aprovacoes;
revoke insert, update, delete on public.aprovacoes from anon, authenticated;

-- ---------- fichas: criar continua pelo navegador, mudar só por função ----------
drop policy if exists fichas_alterar on public.fichas;
revoke insert, update on public.fichas from anon, authenticated;
grant insert (escritorio_id, titulo, pedido, agente_atual) on public.fichas to authenticated;

-- Responsável e sala nunca mudam; o agente tem de ser da mesma sala da ficha.
create or replace function public.fichas_integridade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.criado_por is distinct from old.criado_por or new.escritorio_id is distinct from old.escritorio_id) then
    raise exception 'O responsável e a sala de uma ficha não podem mudar.' using errcode = '42501';
  end if;
  if new.agente_atual is not null
     and (tg_op = 'INSERT' or new.agente_atual is distinct from old.agente_atual)
     and not exists (select 1 from public.agentes where id = new.agente_atual and escritorio_id = new.escritorio_id) then
    raise exception 'O agente precisa ser desta sala.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists fichas_integridade on public.fichas;
create trigger fichas_integridade before insert or update on public.fichas
  for each row execute function public.fichas_integridade();

-- Cancelar: qualquer operador da sala, enquanto a ficha não terminou.
-- Pedidos de aprovação e tarefas locais pendentes da ficha são encerrados junto.
create or replace function public.cancelar_ficha(ficha uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f record;
begin
  select escritorio_id, estado into f from public.fichas where id = ficha for update;
  if not found or not public.tenho_papel(f.escritorio_id, 'operador') then
    raise exception 'Ficha não encontrada ou seu papel não permite essa ação.' using errcode = '42501';
  end if;
  if f.estado not in ('fila', 'trabalhando', 'aguardando_aprovacao', 'erro') then
    raise exception 'Esta ficha já foi encerrada.';
  end if;
  update public.fichas set estado = 'cancelada' where id = ficha;
  update public.aprovacoes set estado = 'recusada', comentario = 'Ficha cancelada.', decidido_por = auth.uid(), decidido_em = now()
    where ficha_id = ficha and estado = 'pendente';
  update public.tarefas_locais set estado = 'erro', resultado = 'Ficha cancelada.'
    where ficha_id = ficha and estado = 'pendente';
end $$;

-- Tentar de novo: volta para a fila uma ficha com erro, ou uma que ficou presa em
-- "trabalhando" (o servidor desiste em 5 minutos; aqui esperamos 6 para ter certeza).
-- Ficha aguardando aprovação não volta para a fila: ela anda pela decisão na mesa.
create or replace function public.retomar_ficha(ficha uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f record;
begin
  select escritorio_id, estado, atualizado_em into f from public.fichas where id = ficha for update;
  if not found or not public.tenho_papel(f.escritorio_id, 'operador') then
    raise exception 'Ficha não encontrada ou seu papel não permite essa ação.' using errcode = '42501';
  end if;
  if f.estado = 'fila' then return; end if;
  if f.estado = 'trabalhando' and f.atualizado_em > now() - interval '6 minutes' then
    raise exception 'O agente ainda está trabalhando nesta ficha. Se ela continuar parada, tente de novo em alguns minutos.';
  end if;
  if f.estado not in ('erro', 'trabalhando') then
    raise exception 'Só dá para tentar de novo uma ficha com erro ou parada.';
  end if;
  update public.fichas set estado = 'fila', resultado = null where id = ficha;
end $$;

revoke all on function public.cancelar_ficha(uuid), public.retomar_ficha(uuid) from public, anon;
grant execute on function public.cancelar_ficha(uuid), public.retomar_ficha(uuid) to authenticated;

-- ---------- tarefas locais: o banco confere a aprovação ----------
alter table public.tarefas_locais add column if not exists aprovacao_id uuid references public.aprovacoes(id) on delete set null;
-- Uma aprovação de comando vale para uma execução só.
create unique index if not exists tarefas_locais_comando_unico on public.tarefas_locais(aprovacao_id) where ferramenta = 'rodar_comando';

create or replace function public.tarefas_locais_conferir() returns trigger
language plpgsql security definer set search_path = public as $$
declare dono uuid;
begin
  select criado_por into dono from public.fichas where id = new.ficha_id;
  if dono is null or dono <> new.user_id then
    raise exception 'A tarefa local só pode ir para o computador de quem criou a ficha.' using errcode = '42501';
  end if;
  -- Comando sempre exige aprovação da própria pessoa, para exatamente este comando.
  if new.ferramenta = 'rodar_comando' or new.aprovacao_id is not null then
    if not exists (
      select 1 from public.aprovacoes a
      where a.id = new.aprovacao_id and a.ficha_id = new.ficha_id and a.estado = 'aprovada'
        and a.decidido_por = new.user_id
        and a.pedido->>'ferramenta' = new.ferramenta
        and a.pedido->'args' = new.args
    ) then
      raise exception 'Esta ação precisa da aprovação de quem é dono do computador.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tarefas_locais_conferir on public.tarefas_locais;
create trigger tarefas_locais_conferir before insert on public.tarefas_locais
  for each row execute function public.tarefas_locais_conferir();

-- A ponte só muda estado e resultado; o pedido em si não pode ser alterado depois.
revoke insert, update, delete on public.tarefas_locais from anon, authenticated;
grant update (estado, resultado) on public.tarefas_locais to authenticated;

commit;
