-- ============================================================================
-- Migración: add-proyectos
-- Fecha: 2026-06-02
-- Propósito: agregar la capability "proyectos" como agrupación N:M libre de
-- ítems, independiente de `category_id` y `scope`. Incluye la tabla
-- `projects`, la tabla join `project_items` (PK compuesta), RLS, policies y
-- triggers de ownership cruzado.
--
-- Aplicar en el dashboard de Supabase (SQL editor) o vía supabase CLI.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Tabla `projects`
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  description text,
  color       text not null default '#8b93a1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  emoji       text,
  status      text not null default 'active' check (status in ('active', 'archived')),
  order_index integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_user_idx
  on public.projects (user_id, status, order_index);

-- ----------------------------------------------------------------------------
-- 2. Tabla join `project_items`
-- ----------------------------------------------------------------------------
create table if not exists public.project_items (
  project_id uuid not null references public.projects(id) on delete cascade,
  item_id    uuid not null references public.items(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (project_id, item_id)
);

create index if not exists project_items_user_idx
  on public.project_items (user_id);

create index if not exists project_items_item_idx
  on public.project_items (item_id);

-- ----------------------------------------------------------------------------
-- 3. RLS en `projects`
-- ----------------------------------------------------------------------------
alter table public.projects enable row level security;

drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own" on public.projects
  for select
  using (user_id = auth.uid());

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects
  for insert
  with check (user_id = auth.uid());

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own" on public.projects
  for delete
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4. RLS en `project_items`
-- ----------------------------------------------------------------------------
alter table public.project_items enable row level security;

drop policy if exists "project_items_select_own" on public.project_items;
create policy "project_items_select_own" on public.project_items
  for select
  using (user_id = auth.uid());

drop policy if exists "project_items_insert_own" on public.project_items;
create policy "project_items_insert_own" on public.project_items
  for insert
  with check (user_id = auth.uid());

drop policy if exists "project_items_delete_own" on public.project_items;
create policy "project_items_delete_own" on public.project_items
  for delete
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 5. Trigger de ownership cruzado en `project_items`
--    Valida que project_id y item_id pertenezcan al mismo user_id de la fila.
--    Defensa en profundidad además de RLS.
-- ----------------------------------------------------------------------------
create or replace function public.check_project_item_ownership()
returns trigger
language plpgsql
as $$
declare
  v_project_user uuid;
  v_item_user    uuid;
begin
  select user_id into v_project_user from public.projects where id = new.project_id;
  if v_project_user is null or v_project_user <> new.user_id then
    raise exception 'PROJECT_OWNERSHIP_MISMATCH'
      using errcode = 'check_violation',
            hint = 'El proyecto no pertenece al usuario.';
  end if;

  select user_id into v_item_user from public.items where id = new.item_id;
  if v_item_user is null or v_item_user <> new.user_id then
    raise exception 'ITEM_OWNERSHIP_MISMATCH'
      using errcode = 'check_violation',
            hint = 'El ítem no pertenece al usuario.';
  end if;

  return new;
end;
$$;

alter function public.check_project_item_ownership() set search_path = public, pg_temp;

drop trigger if exists project_items_ownership_trg on public.project_items;
create trigger project_items_ownership_trg
  before insert on public.project_items
  for each row execute function public.check_project_item_ownership();

-- ----------------------------------------------------------------------------
-- 6. Trigger para mantener `updated_at` en `projects`
-- ----------------------------------------------------------------------------
create or replace function public.touch_projects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter function public.touch_projects_updated_at() set search_path = public, pg_temp;

drop trigger if exists projects_touch_updated_at_trg on public.projects;
create trigger projects_touch_updated_at_trg
  before update on public.projects
  for each row execute function public.touch_projects_updated_at();

commit;

-- ============================================================================
-- Verificación manual (no se ejecuta en la migración):
--   select id, name, status from public.projects;
--   select project_id, item_id from public.project_items;
--   select policyname from pg_policies where tablename in ('projects', 'project_items');
-- ============================================================================
