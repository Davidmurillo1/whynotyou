-- ============================================================================
-- Migración: expandir-categoria-trabajo
-- Fecha: 2026-05-25
-- Propósito: separar ítems entre estudio y trabajo, permitir descomponer un ítem
-- en pasos con peso porcentual, y extender la vista daily_minutes para
-- reportar minutos desglosados por scope.
--
-- Aplicar en el dashboard de Supabase (SQL editor) o vía supabase CLI.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1.1 Columna `scope` en `items` (estudio | trabajo)
-- ----------------------------------------------------------------------------
alter table public.items
  add column if not exists scope text not null default 'study'
  check (scope in ('study', 'work'));

-- ----------------------------------------------------------------------------
-- 1.2 Tabla `item_steps` (descomposición opcional de un ítem en pasos)
-- ----------------------------------------------------------------------------
create table if not exists public.item_steps (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.items(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  position    int  not null,
  name        text not null check (char_length(name) between 1 and 120),
  weight_pct  int  not null check (weight_pct between 1 and 100),
  is_done     bool not null default false,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- 1.3 Índice para listar pasos ordenados por ítem
create index if not exists item_steps_item_position_idx
  on public.item_steps (item_id, position);

create index if not exists item_steps_user_id_idx
  on public.item_steps (user_id);

-- ----------------------------------------------------------------------------
-- 1.4 RLS en `item_steps` (espejo de items)
-- ----------------------------------------------------------------------------
alter table public.item_steps enable row level security;

drop policy if exists "item_steps_select_own" on public.item_steps;
create policy "item_steps_select_own" on public.item_steps
  for select
  using (user_id = auth.uid());

drop policy if exists "item_steps_insert_own" on public.item_steps;
create policy "item_steps_insert_own" on public.item_steps
  for insert
  with check (user_id = auth.uid());

drop policy if exists "item_steps_update_own" on public.item_steps;
create policy "item_steps_update_own" on public.item_steps
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "item_steps_delete_own" on public.item_steps;
create policy "item_steps_delete_own" on public.item_steps
  for delete
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 1.5 Columna `step_id` opcional en `sessions`
-- ----------------------------------------------------------------------------
alter table public.sessions
  add column if not exists step_id uuid
  references public.item_steps(id) on delete set null;

create index if not exists sessions_step_id_idx
  on public.sessions (step_id)
  where step_id is not null;

-- ----------------------------------------------------------------------------
-- 1.6 (deprecated, no se crea): la versión original tenía un trigger
--     DEFERRABLE INITIALLY DEFERRED que exigía suma(weight_pct) = 100. Se quitó
--     porque cada server action es su propia transacción HTTP a Supabase, así
--     que el trigger deferred no podía amortiguar inserts incrementales. El
--     modelo pasó a "pesos relativos": el progreso del ítem se calcula como
--     sum(weight done) / sum(weight). Ver design.md, Decisión 2.
--
--     El check de columna `weight_pct between 1 and 100` se mantiene como
--     guarda mínima a nivel fila.
-- ----------------------------------------------------------------------------
-- 1.7 Vista `daily_minutes` extendida con desglose por scope
--     Asumimos que la vista anterior agregaba por (user_id, local_date) con
--     conversión a timezone del perfil. Reescribimos manteniendo esa idea y
--     agregamos columnas minutes_study y minutes_work.
-- ----------------------------------------------------------------------------
drop view if exists public.daily_minutes cascade;

create view public.daily_minutes
with (security_invoker = true)
as
select
  i.user_id,
  (timezone(coalesce(p.timezone, 'UTC'), s.started_at))::date as local_date,
  round(sum(s.duration_seconds)::numeric / 60.0, 2)::numeric as minutes,
  round(
    coalesce(sum(s.duration_seconds) filter (where i.scope = 'study'), 0)::numeric / 60.0,
    2
  )::numeric as minutes_study,
  round(
    coalesce(sum(s.duration_seconds) filter (where i.scope = 'work'), 0)::numeric / 60.0,
    2
  )::numeric as minutes_work
from public.sessions s
  join public.items i on i.id = s.item_id
  left join public.profiles p on p.id = i.user_id
group by i.user_id, (timezone(coalesce(p.timezone, 'UTC'), s.started_at))::date;

comment on view public.daily_minutes is
  'Minutos por día por usuario, desglosados entre estudio y trabajo. Invariante: minutes = minutes_study + minutes_work.';

-- ----------------------------------------------------------------------------
-- 1.6 (bonus) RPC para registrar sesión + completar paso de forma atómica.
--     Usado por createSessionAction cuando llega complete_step = true.
-- ----------------------------------------------------------------------------
create or replace function public.create_session_with_step(
  p_item_id uuid,
  p_started_at timestamptz,
  p_duration_seconds int,
  p_units_progressed numeric,
  p_note text,
  p_step_id uuid,
  p_complete_step bool
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_session_id uuid;
  v_user_id uuid;
begin
  -- Verificar que el ítem pertenece al usuario actual
  select user_id into v_user_id
  from public.items
  where id = p_item_id;

  if v_user_id is null or v_user_id <> auth.uid() then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Si llega step_id, verificar que pertenece al mismo ítem y usuario
  if p_step_id is not null then
    if not exists (
      select 1 from public.item_steps
      where id = p_step_id and item_id = p_item_id and user_id = auth.uid()
    ) then
      raise exception 'STEP_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  -- Insertar sesión
  insert into public.sessions (item_id, started_at, duration_seconds, units_progressed, note, step_id)
  values (p_item_id, p_started_at, p_duration_seconds, p_units_progressed, p_note, p_step_id)
  returning id into v_session_id;

  -- Si corresponde, marcar el paso como done
  if p_step_id is not null and p_complete_step then
    update public.item_steps
      set is_done = true,
          done_at = now()
      where id = p_step_id;
  end if;

  return v_session_id;
end;
$$;

grant execute on function public.create_session_with_step(uuid, timestamptz, int, numeric, text, uuid, bool) to authenticated;

-- Fijar search_path en la función nueva para evitar el advisor
-- "function_search_path_mutable" (recomendación de seguridad de Supabase).
alter function public.create_session_with_step(uuid, timestamptz, int, numeric, text, uuid, bool)
  set search_path = public, pg_temp;

commit;

-- ============================================================================
-- Migración complementaria (aplicada como 20260525_pesos_relativos_y_edicion_item):
-- mantenida acá en el mismo archivo para que un fresh setup no recree el trigger.
-- Si ya aplicaste la migración inicial con el trigger, esta sección ya corrió
-- (idempotente: los DROP IF EXISTS son seguros).
-- ============================================================================
begin;

drop trigger if exists item_steps_sum_pct_trg on public.item_steps;
drop function if exists public.check_steps_sum_pct();

commit;

-- ============================================================================
-- Migración complementaria (aplicada como 20260525_item_steps_subtasks):
-- agrega jerarquía de 1 nivel a item_steps. Un paso con parent_step_id = null
-- es un "módulo"; un paso con parent_step_id apuntando a un módulo es una
-- "tarea" hija. No se permite anidar más de un nivel (trigger).
-- ============================================================================
begin;

alter table public.item_steps
  add column if not exists parent_step_id uuid
  references public.item_steps(id) on delete cascade;

alter table public.item_steps drop constraint if exists item_steps_no_self_parent;
alter table public.item_steps add constraint item_steps_no_self_parent
  check (parent_step_id is null or parent_step_id <> id);

create index if not exists item_steps_parent_id_idx
  on public.item_steps (parent_step_id)
  where parent_step_id is not null;

create or replace function public.check_step_parent_depth()
returns trigger
language plpgsql
as $$
declare
  v_parent_parent uuid;
  v_parent_item uuid;
begin
  if new.parent_step_id is null then
    return new;
  end if;

  select parent_step_id, item_id into v_parent_parent, v_parent_item
  from public.item_steps
  where id = new.parent_step_id;

  if v_parent_parent is not null then
    raise exception 'STEP_NESTING_TOO_DEEP'
      using errcode = 'check_violation',
            hint = 'Los pasos solo se anidan un nivel (modulo -> tareas).';
  end if;

  if v_parent_item <> new.item_id then
    raise exception 'STEP_PARENT_ITEM_MISMATCH'
      using errcode = 'check_violation',
            hint = 'El paso padre tiene que pertenecer al mismo item.';
  end if;

  return new;
end;
$$;

alter function public.check_step_parent_depth() set search_path = public, pg_temp;

drop trigger if exists item_steps_parent_depth_trg on public.item_steps;
create trigger item_steps_parent_depth_trg
  before insert or update of parent_step_id on public.item_steps
  for each row execute function public.check_step_parent_depth();

commit;

-- ============================================================================
-- Migración complementaria (aplicada como 20260525_steps_decimal_weight_and_progress_mode):
-- weight_pct pasa a numeric(6,2) para aceptar decimales (33.33).
-- Nueva columna progress_mode: 'weighted' (default) o 'count'.
-- ============================================================================
begin;

alter table public.item_steps drop constraint if exists item_steps_weight_pct_check;

alter table public.item_steps
  alter column weight_pct type numeric(6,2)
  using weight_pct::numeric(6,2);

alter table public.item_steps add constraint item_steps_weight_pct_check
  check (weight_pct > 0 and weight_pct <= 100);

alter table public.item_steps
  add column if not exists progress_mode text not null default 'weighted'
  check (progress_mode in ('weighted', 'count'));

commit;

-- ============================================================================
-- Verificación manual (no se ejecuta en la migración):
--   select * from public.daily_minutes order by local_date desc limit 10;
--   select id, name, weight_pct, is_done from public.item_steps where item_id = '...';
--   select scope, count(*) from public.items group by scope;
-- ============================================================================
