## 1. Migración de base de datos (Supabase)

Todo el SQL vive en [supabase/migrations/20260525_expandir_categoria_trabajo.sql](../../../supabase/migrations/20260525_expandir_categoria_trabajo.sql). Aplicar desde el SQL editor del dashboard de Supabase o vía `supabase db push`.

- [x] 1.1 Agregar columna `scope text not null default 'study' check (scope in ('study','work'))` a la tabla `items`.
- [x] 1.2 Crear tabla `item_steps` con columnas: `id uuid pk default gen_random_uuid()`, `item_id uuid not null references items(id) on delete cascade`, `user_id uuid not null references auth.users(id) on delete cascade`, `position int not null`, `name text not null`, `weight_pct int not null check (weight_pct between 1 and 100)`, `is_done bool not null default false`, `done_at timestamptz`, `created_at timestamptz not null default now()`.
- [x] 1.3 Crear índice `(item_id, position)` en `item_steps`.
- [x] 1.4 Habilitar RLS en `item_steps` con políticas SELECT/INSERT/UPDATE/DELETE filtrando por `user_id = auth.uid()` (espejo de `items`).
- [x] 1.5 Agregar columna `step_id uuid null references item_steps(id) on delete set null` a `sessions`.
- [x] 1.6 ~~Crear función trigger `check_steps_sum_pct()` con DEFERRABLE INITIALLY DEFERRED~~ **Revertido tras verify**: el trigger fallaba en el uso real porque cada server action es su propia transacción HTTP (deferred no amortigua inserts incrementales). Se eliminó el trigger y se pasó a "pesos relativos" — progreso = `sum(weight done) / sum(weight)`. Ver design.md, Decisión 2. RPC `create_session_with_step` sí se mantiene.
- [x] 1.7 Reescribir la vista `daily_minutes` (o crear nueva versión) para devolver tres columnas: `minutes`, `minutes_study`, `minutes_work`, calculadas con `coalesce(sum(...) filter (where items.scope = 'study'), 0)` y análogo para `'work'`. Mantener filtrado por `user_id` y `local_date`.
- [x] 1.8 Verificar manualmente con `select * from daily_minutes` que las nuevas columnas devuelven valores correctos para un usuario de prueba (sesiones de estudio y trabajo). Verificado por Claude vía MCP de Supabase tras aplicar la migración: 5 filas en la vista, invariante `minutes = minutes_study + minutes_work` se cumple en todas. Total actual: 686 min estudio, 0 min trabajo (esperado, sin ítems de trabajo todavía). Bonus: trigger probado con suma=100 (acepta), suma=60 (rechaza con mensaje en español), y secuencia atómica insert+insert deferida (acepta). Advisor de Supabase queda sin warnings nuevos tras `set search_path` en funciones.

## 2. Tipos y constantes compartidas

- [x] 2.1 Agregar `ITEM_SCOPE_OPTIONS = [{ value: 'study', label: 'Estudio' }, { value: 'work', label: 'Trabajo' }] as const`, tipo `ItemScope` y helper `scopeLabel(scope)` a [src/lib/items/constants.ts](src/lib/items/constants.ts).
- [x] 2.2 Extender `createItemSchema` en [src/lib/items/schemas.ts](src/lib/items/schemas.ts) para incluir `scope: z.enum(['study','work']).default('study')`.
- [x] 2.3 Extender `createSessionSchema` en el mismo archivo para incluir `step_id: z.string().uuid().optional().or(z.literal(''))` y `complete_step: z.boolean().optional()`.
- [x] 2.4 Crear `src/lib/items/steps-schemas.ts` con `createStepSchema` (`item_id`, `name` 1..120, `weight_pct` 1..100, `position` int ≥ 0), `updateStepSchema` (`id`, opcionalmente `name`, `weight_pct`, `position`, `is_done`), `reorderStepsSchema` (`item_id`, array de `{id, position}`), `deleteStepSchema` (`id`). Bonus: `toggleStepSchema` y helper `computeItemProgress` en [src/lib/items/progress.ts](src/lib/items/progress.ts).

## 3. Server actions

- [x] 3.1 Actualizar `createItemAction` en [src/lib/actions/items.ts](src/lib/actions/items.ts) para leer `scope` de `formData`, validarlo y persistirlo. Agregar `scope` al `revalidatePath` siempre que aplique.
- [x] 3.2 Agregar `updateItemScopeAction(itemId, scope)` en el mismo archivo, con filtrado por `user_id` y `revalidatePath` de `/dashboard`, `/biblioteca`, `/stats`, `/item/[id]`.
- [x] 3.3 Crear `src/lib/actions/steps.ts` con `"use server"` y exportar: `createStepAction`, `updateStepAction`, `reorderStepsAction`, `toggleStepAction`, `deleteStepAction`. Todas validan input con Zod, obtienen `user`, filtran por `user_id` en update/delete, hacen `revalidatePath` de las rutas afectadas (`/item/[id]`, `/dashboard`, `/stats`).
- [x] 3.4 En cada server action de `steps.ts` que modifique pesos (`create`, `update`, `delete`), envolver las operaciones en una sola transacción a través de una RPC en Supabase, **o** confiar en el trigger DB y manejar el error como mensaje en español ("Los pesos de los pasos tienen que sumar 100.").
- [x] 3.5 Actualizar `createSessionAction` en [src/lib/actions/sessions.ts](src/lib/actions/sessions.ts) para aceptar `step_id` y `complete_step` opcionales. Si llegan: validar que el paso pertenece al ítem y al usuario; persistir la sesión con `step_id`; si `complete_step = true`, actualizar `is_done = true` y `done_at = now()` del paso **en la misma transacción** (RPC `create_session_with_step`). Recalcular `itemCompleted` considerando que si el ítem tiene pasos y todos quedan `done`, también está completo.
- [x] 3.6 Cubrir el caso de `step_id` borrado: como `step_id` en sesiones es `ON DELETE SET NULL`, no hace falta limpieza extra; documentarlo en el archivo de la action.

## 4. UI — formulario y detalle de ítem

- [x] 4.1 Agregar al `ItemForm` en [src/app/(app)/item/nuevo/item-form.tsx](src/app/(app)/item/nuevo/item-form.tsx) un selector visual de scope (radio o segmented control) con `Estudio` (default) y `Trabajo`. Estilo coherente con el resto del form, tokens de color del proyecto.
- [x] 4.2 En [src/app/(app)/item/[id]/page.tsx](src/app/(app)/item/%5Bid%5D/page.tsx), mostrar el scope en la cabecera (un chip o subtítulo: "Estudio" / "Trabajo") y permitir cambiarlo desde un menú o un componente nuevo `ItemScopeEditor`.
- [x] 4.3 En la misma página, agregar sección "Pasos": lista ordenada con cada paso (nombre, peso %, checkbox para `is_done`, botón borrar, asa de drag o flechas para reordenar). Si el ítem no tiene pasos, mostrar un CTA "Descomponer en pasos" que abre un formulario inline.
- [x] 4.4 Crear componente client `<StepsEditor>` (en `src/app/(app)/item/[id]/steps-editor.tsx`) que renderiza la lista y dispara las server actions. Manejar los errores de validación del trigger (suma != 100) mostrando el mensaje en español.
- [x] 4.5 Asegurar que el componente `ProgressRing` y el contador de unidades en la cabecera del ítem muestren progreso desde pasos cuando los hay (función helper `computeItemProgress(item, steps)` en [src/lib/items/progress.ts](src/lib/items/progress.ts)).
- [x] 4.6 Cuando el ítem tiene pasos, mostrar arriba del `ProgressRing` (o como tooltip) el texto "Progreso por pasos · N de M completados". Cuando no, mantener `current_units / total_units` como hoy.

## 5. UI — sesión con paso

- [x] 5.1 En la página de sesión [src/app/(app)/item/[id]/sesion/page.tsx](src/app/(app)/item/%5Bid%5D/sesion/page.tsx) (o su componente cliente `session-runner.tsx`), si el ítem tiene pasos, mostrar un selector de paso al cerrar la sesión, con opción "Sin paso" para retrocompatibilidad.
- [x] 5.2 Si el usuario elige un paso, agregar un toggle "Marcar paso como completado" que viaja como `complete_step` en la server action.
- [x] 5.3 Al volver del flujo de sesión, asegurar que el listado de pasos del ítem refleja el cambio (vía `revalidatePath` en `createSessionAction` + `router.refresh()` en el runner).

## 6. UI — biblioteca

- [x] 6.1 Agregar tabs / segmented control "Todo / Estudio / Trabajo" arriba del listado en [src/app/(app)/biblioteca/page.tsx](src/app/(app)/biblioteca/page.tsx). El filtro vive en el query string (`?scope=work`), no se persiste en sesión.
- [x] 6.2 Filtrar la consulta de items según `scope` cuando viene en el query string. Sin scope o `scope=all` → todos.
- [x] 6.3 Mostrar un pequeño chip de scope en cada row del listado para diferenciar visualmente.

## 7. UI — dashboard

- [x] 7.1 En [src/app/(app)/dashboard/page.tsx](src/app/(app)/dashboard/page.tsx), separar `itemsList` en `studyItems` y `workItems` después de la consulta a Supabase.
- [x] 7.2 Si ambos arrays están no vacíos, renderizar dos secciones con encabezados ("Estudio" / "Trabajo"). Si solo uno, mantener el layout actual (sin encabezado redundante).
- [x] 7.3 Actualizar [src/lib/greetings.ts](src/lib/greetings.ts) para aceptar un flag `hasWork: boolean`. Cuando `hasWork = true`, las variantes del greeting usan voz neutral ("lo que tenés entre manos") en vez de "lo que estás aprendiendo".
- [x] 7.4 En el dashboard, pasar `hasWork = workItems.length > 0` a `getGreeting`.
- [x] 7.5 Actualizar el `<EmptyState>` del dashboard para que su copy también sea neutral cuando corresponde (o crear un segundo empty state para usuarios con scope work activos).

## 8. UI — stats

- [x] 8.1 En [src/app/(app)/stats/page.tsx](src/app/(app)/stats/page.tsx), leer las nuevas columnas `minutes_study` y `minutes_work` de la consulta a `daily_minutes`.
- [x] 8.2 Detectar `hasWork = items.some(i => i.scope === 'work')`. Si `false`, renderizar la página exactamente como hoy.
- [x] 8.3 Si `hasWork = true`, la sección "Tu camino hasta acá" muestra dos chips por métrica relevante (tiempo total estudio / tiempo total trabajo). Decidir cuáles métricas se splittean: tiempo total y sesiones; racha e ítems cerrados quedan globales.
- [x] 8.4 Actualizar [src/app/(app)/stats/weekly-chart.tsx](src/app/(app)/stats/weekly-chart.tsx) para aceptar `weekDays: { date, minutesStudy, minutesWork }[]` y renderizar barras apiladas o duales con leyenda.
- [x] 8.5 Cuando `hasWork = false`, el componente `WeeklyChart` colapsa a la forma actual (una sola serie). Cuidar que no rompa.
- [x] 8.6 Actualizar [src/app/(app)/stats/category-breakdown.tsx](src/app/(app)/stats/category-breakdown.tsx) (y su consulta en `stats/page.tsx`) para aceptar un filtro de scope. UI: un mini-control "Todo / Estudio / Trabajo" arriba de la lista (cliente, no persistente).
- [x] 8.7 Actualizar el copy de la sección de heatmap: si `hasWork = true`, "X días con actividad" en lugar de "X días con estudio".
- [x] 8.8 No partir el heatmap en dos cuadrículas en este change (explícito).

## 12. Iteración post-verify (decimales + modo de cálculo)

- [x] 12.1 Migración DB `20260525_steps_decimal_weight_and_progress_mode`: `weight_pct` cambia de `int` a `numeric(6,2)` con check `> 0 AND <= 100`. Nueva columna `progress_mode text default 'weighted' check (in 'weighted','count')`.
- [x] 12.2 Schemas Zod: `weight_pct` deja de ser `int`, ahora `gt(0).max(100)` aceptando decimales. Nuevo enum `progressModeEnum = z.enum(['weighted','count'])`. `createStepSchema` y `updateStepSchema` aceptan `progress_mode` opcional.
- [x] 12.3 `progress.ts`: `computeStepProgress` consulta `step.progress_mode` y ramifica: `count` → `done_count / total_count`; `weighted` → suma ponderada (comportamiento anterior). Tipo `StepLike` incluye `progress_mode?: ProgressMode | null`.
- [x] 12.4 `createStepAction` y `updateStepAction` aceptan `progress_mode` opcional. `StepRow` retornado incluye `progress_mode`.
- [x] 12.5 `StepsEditor`: nuevo subcomponente `<ProgressModeToggle>` ("Por peso / Por cantidad") visible solo cuando el módulo tiene tareas. En modo `count`, los inputs de peso de las tareas hijas se ocultan (el dato se preserva en DB). Inputs aceptan `step="any"` para permitir decimales.
- [x] 12.6 Consultas en `/item/[id]/page.tsx`, `/item/[id]/sesion/page.tsx` y `/dashboard/page.tsx` traen `progress_mode`.
- [x] 12.7 design.md: revisar Decisión 2 (decimales explícitos); nueva Decisión 9c. spec item-steps: requirement "Pesos relativos" actualizado, requirement nuevo "Modo de cálculo del progreso del módulo" con 4 scenarios.

## 11. Iteración post-verify (jerarquía módulo → tareas)

- [x] 11.1 Migración DB: columna `parent_step_id uuid` con `ON DELETE CASCADE`, índice, constraint anti-self-parent, trigger `check_step_parent_depth` que rechaza anidación de 2+ niveles y padre de otro ítem (migración `20260525_item_steps_subtasks`).
- [x] 11.2 Extender `createStepSchema` con `parent_step_id` opcional. Tipo `Step` ahora incluye `parent_step_id: string | null`.
- [x] 11.3 Reescribir `computeItemProgress` en [src/lib/items/progress.ts](src/lib/items/progress.ts) con cálculo jerárquico: por cada módulo raíz, `progress = is_done ? 1 : children_done_weight / children_weight`; ítem = `sum(root.weight * root.progress) / sum(root.weight)`. Helpers nuevos: `computeStepProgress`, `isStepEffectivelyDone`. `stepsSummary` cuenta solo raíces.
- [x] 11.4 `createStepAction` acepta `parent_step_id`, valida que el padre exista, sea raíz y pertenezca al mismo ítem; calcula la `position` por nivel (al final del módulo padre o al final del nivel raíz).
- [x] 11.5 `toggleStepAction` rechaza el toggle cuando el paso tiene hijos (estado derivado).
- [x] 11.6 `mapPgError` traduce `STEP_NESTING_TOO_DEEP` y `STEP_PARENT_ITEM_MISMATCH` al español.
- [x] 11.7 Reescribir `StepsEditor` con vista jerárquica: módulos al nivel raíz; tareas indentadas dentro; barra de progreso por módulo cuando tiene tareas; "+ Agregar tarea" inline por módulo; checkbox del módulo deshabilitado cuando tiene tareas.
- [x] 11.8 Actualizar consultas en `/item/[id]/page.tsx`, `/item/[id]/sesion/page.tsx` y `/dashboard/page.tsx` para incluir `parent_step_id` y usar `stepsSummary` (cuenta solo módulos raíz).
- [x] 11.9 Actualizar design.md (Decisión 9b: pasos jerárquicos, fórmula de progreso, estado derivado) y revertir el Non-Goal original "lista plana ordenada".
- [x] 11.10 Actualizar spec `item-steps`: requirement "Pasos como descomposición" menciona `parent_step_id`; nuevos requirements "Jerarquía de un solo nivel" (4 scenarios) y "Estado y progreso derivado para módulos con tareas" (4 scenarios).

## 10. Iteración post-verify (pesos relativos + edición de ítem)

- [x] 10.1 Eliminar trigger `item_steps_sum_pct_trg` y función `check_steps_sum_pct` (DB).
- [x] 10.2 Cambiar `computeItemProgress` en [src/lib/items/progress.ts](src/lib/items/progress.ts) para usar pesos relativos (`done_weight / total_weight`).
- [x] 10.3 Quitar el manejo de `STEPS_SUM_NOT_100` de `mapPgError` en [src/lib/actions/steps.ts](src/lib/actions/steps.ts).
- [x] 10.4 Actualizar `StepsEditor` para mostrar "X% del peso total" en vez del indicador rojo/verde de suma=100. Quitar el `confirm` que asumía rebalance manual al borrar.
- [x] 10.5 Agregar `updateItemFieldsAction` en [src/lib/actions/items.ts](src/lib/actions/items.ts) con schema Zod `updateItemFieldsSchema` y guarda `current_units ≤ total_units`.
- [x] 10.6 Crear componente client `<ItemDetailsEditor>` en [src/app/(app)/item/[id]/item-details-editor.tsx](src/app/(app)/item/%5Bid%5D/item-details-editor.tsx) — edición inline de title, kind, unit_type, total_units, source_url.
- [x] 10.7 Integrar `<ItemDetailsEditor>` en la página de detalle del ítem ([src/app/(app)/item/[id]/page.tsx](src/app/(app)/item/%5Bid%5D/page.tsx)).
- [x] 10.8 Actualizar design.md (Decisión 2 + Decisión 9), spec de item-steps (requirement "Pesos relativos sin obligación de cerrar 100"), spec de item-scope (requirement "Edición de atributos del ítem").

## 9. Lint y verificación

- [x] 9.1 Correr `npm run lint` y confirmar que el conteo de errores no aumentó respecto a los 5 preexistentes documentados en `CLAUDE.md`. Verificado: `npm run lint` reporta exactamente los mismos 5 errores preexistentes (profile-form, dashboard, session-runner, weekly-chart, proxy). Ninguno introducido por este change.
- [x] 9.2 Correr `npm run build` y confirmar que el proyecto compila sin errores de tipos. Verificado: build pasa limpio, "Compiled successfully", "Finished TypeScript". 14 rutas generadas correctamente.
- [x] 9.3 Verificar manualmente los flujos en `npm run dev`. **Confirmado por el usuario al archivar**: probó crear ítem con scope work, agregar módulos y tareas (con bug de suma=100 detectado e iterado), pesos decimales, modo "por cantidad", split de stats. Iteramos sobre lo encontrado en cuatro rondas de verify hasta llegar al estado actual funcional.
- [x] 9.4 Copy del greeting con/sin trabajo. **Confirmado por el usuario al archivar** ("se ha logrado lo querido exitosamente").
- [x] 9.5 Ítems preexistentes con scope study siguen funcionando. **Confirmado por el usuario al archivar** — el ítem único de estudio preexistente quedó con `scope='study'` por default tras la migración y siguió mostrando progreso por unidades.
