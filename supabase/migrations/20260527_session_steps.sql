-- Tabla puente N:N entre sesiones y pasos.
-- Una sesión puede asociarse a múltiples pasos; el tiempo NO se duplica en stats.

create table public.session_steps (
  session_id          uuid        not null references public.sessions(id)    on delete cascade,
  step_id             uuid        not null references public.item_steps(id)  on delete cascade,
  user_id             uuid        not null references auth.users(id)         on delete cascade,
  completed_in_session boolean    not null default false,
  created_at          timestamptz not null default now(),
  primary key (session_id, step_id)
);

alter table public.session_steps enable row level security;

create policy "session_steps_select_own" on public.session_steps
  for select using (auth.uid() = user_id);

create policy "session_steps_insert_own" on public.session_steps
  for insert with check (auth.uid() = user_id);

create policy "session_steps_delete_own" on public.session_steps
  for delete using (auth.uid() = user_id);

create index session_steps_step_idx on public.session_steps(step_id);
create index session_steps_user_idx on public.session_steps(user_id);

-- Backfill: sesiones históricas con step_id pasan a tener una fila en session_steps.
-- user_id se obtiene via items porque sessions no tiene la columna directamente.
insert into public.session_steps (session_id, step_id, user_id, completed_in_session)
select s.id, s.step_id, i.user_id, false
from public.sessions s
join public.items i on i.id = s.item_id
where s.step_id is not null
on conflict do nothing;

-- RPC plural: inserta sesión + asociaciones + togglea is_done atómicamente.
-- Reemplaza create_session_with_step (singular) para la nueva UI.
create or replace function public.create_session_with_steps(
  p_item_id          uuid,
  p_started_at       timestamptz,
  p_duration_seconds int,
  p_units_progressed numeric,
  p_note             text,
  p_steps            jsonb  -- [{step_id: uuid, complete: bool}]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_session_id  uuid;
  v_item_user   uuid;
  v_entry       jsonb;
  v_step_id     uuid;
  v_complete    boolean;
  v_has_children boolean;
begin
  -- Validar que el ítem existe y pertenece al usuario.
  select user_id into v_item_user
  from public.items
  where id = p_item_id;

  if v_item_user is null then
    raise exception 'ITEM_NOT_FOUND';
  end if;
  if v_item_user <> v_user_id then
    raise exception 'ITEM_NOT_OWNED';
  end if;

  -- Insertar sesión (sin step_id — las asociaciones van a session_steps).
  insert into public.sessions(item_id, user_id, started_at, duration_seconds, units_progressed, note)
  values (p_item_id, v_user_id, p_started_at, p_duration_seconds, p_units_progressed, p_note)
  returning id into v_session_id;

  -- Procesar cada paso recibido.
  if p_steps is not null and jsonb_array_length(p_steps) > 0 then
    for v_entry in select * from jsonb_array_elements(p_steps)
    loop
      v_step_id := (v_entry->>'step_id')::uuid;
      v_complete := coalesce((v_entry->>'complete')::boolean, false);

      -- Validar que el paso pertenece al ítem y al usuario.
      if not exists (
        select 1 from public.item_steps
        where id = v_step_id and item_id = p_item_id and user_id = v_user_id
      ) then
        raise exception 'STEP_NOT_FOUND';
      end if;

      -- Insertar asociación.
      insert into public.session_steps(session_id, step_id, user_id, completed_in_session)
      values (v_session_id, v_step_id, v_user_id, v_complete)
      on conflict do nothing;

      -- Si se pidió completar: solo lo hacemos si NO tiene hijos (is_done derivado).
      if v_complete then
        select exists(
          select 1 from public.item_steps where parent_step_id = v_step_id
        ) into v_has_children;

        if not v_has_children then
          update public.item_steps
          set is_done = true, done_at = now()
          where id = v_step_id and is_done = false;
        end if;
      end if;
    end loop;
  end if;

  return v_session_id;
end;
$$;

-- Permisos de ejecución para usuarios autenticados.
grant execute on function public.create_session_with_steps(uuid, timestamptz, int, numeric, text, jsonb)
  to authenticated;
