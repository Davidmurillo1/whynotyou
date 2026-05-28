## Context

El cronómetro de sesiones (`src/app/(app)/item/[id]/sesion/session-runner.tsx`) hoy:

1. Cuenta el tiempo en una fase `running`.
2. En la fase `capture` muestra un `<select>` con todos los pasos del ítem agrupados en "Pendientes" / "Ya completados" — el usuario elige **uno** y opcionalmente lo marca como completado.
3. Llama a `createSessionAction` con `step_id` (singular) + `complete_step` (boolean).
4. El backend usa la RPC `create_session_with_step` para insertar en `sessions` y, si corresponde, hacer `is_done = true` en `item_steps` atómicamente.

Schema actual (relevante):
- `sessions(id, user_id, item_id, started_at, duration_seconds, units_progressed, note, step_id)` — `step_id` es FK opcional a `item_steps`, `ON DELETE SET NULL`.
- `item_steps(id, user_id, item_id, parent_step_id, name, weight_pct, position, is_done, done_at, progress_mode)`.

Restricciones a respetar (de `openspec/specs/item-steps/spec.md`):
- Los módulos con tareas hijas tienen `is_done` **derivado**: no se permite toggle manual.
- Las cascadas son `ON DELETE CASCADE` desde `parent_step_id` y `ON DELETE SET NULL` desde `sessions.step_id`.
- RLS filtra por `user_id` en todas las tablas; las server actions filtran explícito también.

El producto está en MVP, sin tests automatizados. La migración es destructiva si tocamos `sessions.step_id` directo, así que requiere cuidado.

## Goals / Non-Goals

**Goals:**
- Permitir que una sesión se asocie a N pasos.
- Permitir, dentro del mismo flujo, marcar uno o varios pasos como completados.
- Mostrar feedback visual ("tachado") en la pantalla de cierre antes de guardar para que el usuario vea cuáles tareas quedarán hechas.
- No inflar tiempo en estadísticas (3 tareas en una sesión de 1h NO suman 3h).
- Mantener atomicidad: insertar sesión + asociaciones + togglear `is_done` ocurre en una sola transacción.
- Migrar las sesiones históricas sin perder datos.

**Non-Goals:**
- No agregar "porcentaje parcial" por tarea (la respuesta del usuario fue binario: avancé/terminé).
- No cambiar el cálculo de `units_progressed` cuando hay pasos (sigue siendo 0).
- No tocar `current_units` ni el flujo de `itemCompleted`.
- No agregar selección múltiple en la rama "sin pasos" (ítem que sólo usa unidades).
- No permitir des-completar pasos desde esta pantalla (sigue siendo solo en la página del ítem).

## Decisions

### Decisión 1: Tabla puente `session_steps` (vs columna `step_ids jsonb` o sesiones duplicadas)

Crear:

```sql
create table public.session_steps (
  session_id uuid not null references public.sessions(id) on delete cascade,
  step_id    uuid not null references public.item_steps(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  completed_in_session boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (session_id, step_id)
);

-- RLS
alter table public.session_steps enable row level security;
create policy "session_steps_select_own" on public.session_steps
  for select using (auth.uid() = user_id);
create policy "session_steps_insert_own" on public.session_steps
  for insert with check (auth.uid() = user_id);
create policy "session_steps_delete_own" on public.session_steps
  for delete using (auth.uid() = user_id);

-- Índices
create index session_steps_step_idx on public.session_steps(step_id);
create index session_steps_user_idx on public.session_steps(user_id);
```

**Por qué** vs `jsonb`: queries como "cuánto tiempo le dediqué a la tarea X" se vuelven naturales con `JOIN`. RLS por fila es estándar. La PK compuesta evita duplicados.

**Por qué** vs múltiples sesiones (una por step): la suma de `duration_seconds` en stats se duplicaría. Cualquier consulta de "tiempo total" tendría que hacer `DISTINCT ON (session_id)` y eso es propenso a errores.

**`ON DELETE CASCADE` desde `item_steps`**: difiere del comportamiento actual (`SET NULL` desde `sessions.step_id`). Justificación: las filas de `session_steps` son una _proyección_ de la asociación; si se borra el paso, la asociación pierde sentido. La sesión madre (`sessions`) NO se borra. Esto preserva tiempo total y no rompe stats por scope/ítem.

### Decisión 2: Deprecar `sessions.step_id` en lugar de eliminarla

En esta migración:
1. Crear `session_steps`.
2. Backfill: `INSERT INTO session_steps (session_id, step_id, user_id, completed_in_session) SELECT id, step_id, user_id, false FROM sessions WHERE step_id IS NOT NULL`.
3. Dejar `sessions.step_id` poblada por ahora (no la eliminamos en este change).

**Por qué**: si algo se nos pasa (algún query oculto que la lee), evitamos romper en producción. La eliminación queda como un follow-up cuando sepamos que nadie más la lee.

**Trade-off**: tenemos dos fuentes de verdad temporalmente. Mitigación: la nueva server action **NO** escribe `sessions.step_id` para sesiones nuevas — toda asociación nueva vive en `session_steps`. Pseudo-código del backfill diferencial al leer una sesión: priorizar `session_steps` sobre `sessions.step_id`.

### Decisión 3: Nueva RPC `create_session_with_steps` (plural)

Reemplaza a `create_session_with_step`. Firma:

```sql
create or replace function public.create_session_with_steps(
  p_item_id uuid,
  p_started_at timestamptz,
  p_duration_seconds int,
  p_units_progressed numeric,
  p_note text,
  p_steps jsonb -- [{step_id, complete}]
) returns uuid
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_item_user uuid;
  v_entry jsonb;
  v_step_id uuid;
  v_complete boolean;
  v_step_record record;
begin
  -- Validar ítem
  select user_id into v_item_user from items where id = p_item_id;
  if v_item_user is null then raise exception 'ITEM_NOT_FOUND'; end if;
  if v_item_user <> v_user_id then raise exception 'ITEM_NOT_OWNED'; end if;

  -- Insertar sesión
  insert into sessions(item_id, user_id, started_at, duration_seconds, units_progressed, note)
  values (p_item_id, v_user_id, p_started_at, p_duration_seconds, p_units_progressed, p_note)
  returning id into v_session_id;

  -- Insertar asociaciones y togglear is_done según corresponda
  if p_steps is not null then
    for v_entry in select * from jsonb_array_elements(p_steps) loop
      v_step_id := (v_entry->>'step_id')::uuid;
      v_complete := coalesce((v_entry->>'complete')::boolean, false);

      -- Validar que el paso pertenece al ítem y al usuario
      select id, parent_step_id, is_done
        into v_step_record
        from item_steps
        where id = v_step_id and item_id = p_item_id and user_id = v_user_id;
      if not found then raise exception 'STEP_NOT_FOUND'; end if;

      insert into session_steps(session_id, step_id, user_id, completed_in_session)
      values (v_session_id, v_step_id, v_user_id, v_complete);

      if v_complete then
        -- Si es un módulo con hijos, ignorar (is_done derivado).
        if exists (select 1 from item_steps where parent_step_id = v_step_id) then
          continue;
        end if;
        update item_steps
          set is_done = true, done_at = now()
          where id = v_step_id and is_done = false;
      end if;
    end loop;
  end if;

  return v_session_id;
end;
$$;
```

**Por qué `security definer`**: ya lo era para la versión singular; mantiene la atomicidad transaccional y simplifica el manejo de errores en cliente.

**Por qué ignorar silenciosamente "completar módulo con hijos"**: el front bloquea la UI, pero defensa en profundidad. Si llegara igual, no rompemos la operación entera — sólo no actuamos sobre `is_done` derivado.

### Decisión 4: UI por checkboxes anidados (vs multi-select nativo)

Reemplazar el `<select>` por una lista renderizada custom:

```
☐ — Sin paso —
PENDIENTES
  ☐ 1. Planear (30%)
  ☐ 2. Hacer (70%)
    ☐ 2.2 Desarrollar Spec (1%)         [✓ Terminé]
    ☐ 1.2 Arreglar Tachado Tareas (1%)  [  Terminé]
YA COMPLETADOS
  ☐ ✓ 1.1 Mejorar Porcentaje Avance
```

- Checkbox principal por paso: "trabajé acá".
- Checkbox secundario "Terminé" sólo visible cuando el principal está marcado Y el paso es completable (no es módulo con hijos, no está ya completado).
- Para pasos ya completados: el "Terminé" no se muestra (no tiene sentido).
- Para módulos con hijos: el "Terminé" se muestra deshabilitado con tooltip "Se completa cuando termines todas sus tareas".
- Si "Terminé" está marcado, el nombre del paso se renderiza con `line-through` y opacity reducida en la propia pantalla — feedback inmediato.

**Por qué no `<select multiple>`**: nativo en mobile es horroroso (lista plana, sin agrupación visible, sin checkbox secundario). Custom da control total sobre el "Terminé" anidado y el tachado en vivo.

### Decisión 5: Schema Zod con array

```ts
// src/lib/items/schemas.ts
export const sessionStepSchema = z.object({
  step_id: z.string().uuid(),
  complete: z.boolean().default(false),
})
export const createSessionSchema = z.object({
  item_id: z.string().uuid(),
  started_at: z.string(),
  duration_seconds: z.coerce.number().int().min(0).max(86400),
  units_progressed: z.coerce.number().min(0),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
  steps: z.array(sessionStepSchema).max(50).optional(),
})
```

**`.max(50)`**: hard-cap defensivo. Un ítem típico tiene <30 pasos; 50 es holgura.

### Decisión 6: Re-render en sitios que usaban `sessions.step_id`

Buscar usos antes de hacer cambios:
- `src/lib/actions/sessions.ts` — escribe la columna hoy.
- `src/lib/highlights.ts` — verificar si calcula highlights por step.
- `src/app/(app)/dashboard/page.tsx` — verificar last session display.
- `src/app/(app)/stats/**` — verificar breakdown si lo hubiera.
- `src/app/(app)/item/[id]/page.tsx` — verificar "sesiones recientes".

Estrategia: para cada lugar que lea "el paso de esta sesión", reemplazar por un join a `session_steps`. Si una sesión tiene N pasos asociados, mostrar el primero, "+N más" o todos según el contexto. Para sesiones legacy con sólo `sessions.step_id`, el backfill ya creó la fila correspondiente en `session_steps` así que el join devuelve uno.

## Risks / Trade-offs

- **[Migración del backfill rompe sesiones existentes]** → Mitigación: la migración se ejecuta en una transacción `BEGIN … COMMIT`; si falla, no se aplica nada. Verificar en local con un dump de prod antes.
- **[Dos columnas para el mismo dato durante la transición]** → Mitigación: nueva server action ignora `sessions.step_id` por completo y siempre escribe en `session_steps`. Lectura prefiere `session_steps`. Eliminación de `sessions.step_id` queda fuera de scope (follow-up change).
- **[Usuarios con muchos pasos hacen N inserts]** → Mitigación: `.max(50)` en Zod + límite implícito por scroll UX. 50 inserts es trivial en una sola transacción de Postgres.
- **[Atomicidad si el RPC falla a mitad]** → Postgres da rollback automático dentro de la función; mitigado por diseño.
- **[El usuario marca "Terminé" en una tarea cuyo padre se completa cascadeando]** → No es un problema: el padre se recalcula como derivado en lecturas; no escribimos `is_done` del padre en este flujo. Spec `item-steps` ya cubre esto.
- **[Stats por step hoy son inexistentes pero podrían sumarse]** → Documentar en el README de stats que las queries deben hacer JOIN a `session_steps`. Sin riesgo inmediato.

## Migration Plan

1. **Migración SQL** (`supabase/migrations/<timestamp>_session_steps.sql`):
   - Crear `session_steps` con PK compuesta, FKs, RLS, índices.
   - Backfill `INSERT … SELECT` desde `sessions` donde `step_id IS NOT NULL`.
   - Crear o reemplazar la RPC `create_session_with_steps`.
   - **NO** dropear `sessions.step_id` en esta migración.

2. **Tipos TS regenerados** (`supabase gen types typescript`) — opcional, el proyecto tipa manualmente la mayoría.

3. **Server action** (`src/lib/actions/sessions.ts`):
   - Cambiar firma a `steps: Array<{ step_id, complete }>`.
   - Llamar nueva RPC.
   - **Backwards-compat soft**: si el caller manda `step_id`/`complete_step` (forma vieja), convertirlo a `steps: [{ step_id, complete: complete_step }]` antes de llamar al RPC.

4. **UI** (`session-runner.tsx`):
   - Reescribir fase `capture`: checkboxes anidados, agrupación por módulo.
   - Estado local: `Map<step_id, { selected, complete }>`.
   - Submit envía `steps` (array filtrado por `selected = true`).

5. **Lecturas afectadas**:
   - Buscar `sessions.step_id` en el código con `Grep`.
   - Reemplazar lecturas por `session_steps` join.
   - Para la migración blanda, las lecturas pueden seguir aceptando ambas fuentes, pero **escrituras** solo van a `session_steps`.

6. **Rollback**:
   - Si algo sale mal, revertir el commit del front y mantener la migración SQL (la tabla nueva no rompe lecturas viejas; la RPC vieja sigue existiendo si no la dropeamos — dejarla como `create_session_with_step` _y_ crear la nueva con nombre distinto).

## Open Questions

- ¿Tiene sentido permitir cambiar la nota por paso (note per association)? **Decisión actual: NO**, una sola nota por sesión global. Mantener simple.
- ¿Mostramos el tiempo por paso en la página del ítem? **Fuera de scope**; mencionar como follow-up.
- ¿Existe alguna view materializada que dependa de `sessions.step_id`? Verificar en migrate apply. Si existe, hay que recrearla — pero parece improbable dado el tamaño del MVP.
