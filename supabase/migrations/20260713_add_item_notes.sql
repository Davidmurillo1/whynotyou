-- ============================================================================
-- Migración: add-notas
-- Fecha: 2026-07-13
-- Propósito: notas discretas (1:N) sobre ítems, módulos y tareas. Una sola
-- tabla `item_notes` con `item_id` denormalizado (SIEMPRE presente) y `step_id`
-- nullable: step_id NULL = nota del ítem ("proyecto en general"); step_id
-- seteado = nota de un módulo o de una tarea (item_steps cubre ambos niveles).
-- Este diseño permite traer TODAS las notas del ítem + sus pasos con UNA sola
-- query filtrando por item_id (sin embed, sin 2da pasada, sin chicken-egg con
-- los step ids). Incluye índices, RLS, policies, trigger de ownership+coherencia
-- y touch de updated_at. Calcado de 20260602_add_proyectos.sql.
--
-- NOTA: user_id referencia auth.users(id) (igual que projects e item_steps),
-- NO profiles. Confirmado contra el schema live.
--
-- Aplicar en el dashboard de Supabase (SQL editor) o vía supabase CLI.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Tabla `item_notes`
-- ----------------------------------------------------------------------------
create table if not exists public.item_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  item_id    uuid not null references public.items(id) on delete cascade,
  step_id    uuid references public.item_steps(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. Índices
--    item_id: filtro principal de lectura (una query trae ítem + pasos).
--    step_id parcial: solo notas de paso; particiona en memoria.
-- ----------------------------------------------------------------------------
create index if not exists item_notes_item_idx on public.item_notes (item_id);
create index if not exists item_notes_step_idx on public.item_notes (step_id) where step_id is not null;
create index if not exists item_notes_user_idx on public.item_notes (user_id);

-- ----------------------------------------------------------------------------
-- 3. RLS en `item_notes`
-- ----------------------------------------------------------------------------
alter table public.item_notes enable row level security;

drop policy if exists "item_notes_select_own" on public.item_notes;
create policy "item_notes_select_own" on public.item_notes
  for select using (user_id = auth.uid());

drop policy if exists "item_notes_insert_own" on public.item_notes;
create policy "item_notes_insert_own" on public.item_notes
  for insert with check (user_id = auth.uid());

drop policy if exists "item_notes_update_own" on public.item_notes;
create policy "item_notes_update_own" on public.item_notes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "item_notes_delete_own" on public.item_notes;
create policy "item_notes_delete_own" on public.item_notes
  for delete using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4. Trigger de ownership + coherencia (defensa en profundidad además de RLS).
--    Valida: (a) el ítem pertenece al user; (b) si hay step_id, el paso
--    pertenece al user Y su item_id coincide con new.item_id (evita fuga
--    cross-item por un item_id denormalizado inconsistente).
-- ----------------------------------------------------------------------------
create or replace function public.check_item_note_ownership()
returns trigger
language plpgsql
as $$
declare
  v_item_user uuid;
  v_step_user uuid;
  v_step_item uuid;
begin
  select user_id into v_item_user from public.items where id = new.item_id;
  if v_item_user is null or v_item_user <> new.user_id then
    raise exception 'NOTE_ITEM_OWNERSHIP_MISMATCH'
      using errcode = 'check_violation',
            hint = 'El ítem no pertenece al usuario.';
  end if;

  if new.step_id is not null then
    select user_id, item_id into v_step_user, v_step_item
      from public.item_steps where id = new.step_id;
    if v_step_user is null or v_step_user <> new.user_id then
      raise exception 'NOTE_STEP_OWNERSHIP_MISMATCH'
        using errcode = 'check_violation',
              hint = 'El paso no pertenece al usuario.';
    end if;
    if v_step_item <> new.item_id then
      raise exception 'NOTE_STEP_ITEM_MISMATCH'
        using errcode = 'check_violation',
              hint = 'El paso pertenece a otro ítem.';
    end if;
  end if;

  return new;
end;
$$;

alter function public.check_item_note_ownership() set search_path = public, pg_temp;

drop trigger if exists item_notes_ownership_trg on public.item_notes;
create trigger item_notes_ownership_trg
  before insert or update on public.item_notes
  for each row execute function public.check_item_note_ownership();

-- ----------------------------------------------------------------------------
-- 5. Trigger para mantener `updated_at` (habilita edición futura sin migración).
-- ----------------------------------------------------------------------------
create or replace function public.touch_item_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter function public.touch_item_notes_updated_at() set search_path = public, pg_temp;

drop trigger if exists item_notes_touch_updated_at_trg on public.item_notes;
create trigger item_notes_touch_updated_at_trg
  before update on public.item_notes
  for each row execute function public.touch_item_notes_updated_at();

commit;

-- ============================================================================
-- Verificación manual (no se ejecuta en la migración):
--   select id, item_id, step_id, left(body, 40) from public.item_notes;
--   select policyname from pg_policies where tablename = 'item_notes';
-- ============================================================================
