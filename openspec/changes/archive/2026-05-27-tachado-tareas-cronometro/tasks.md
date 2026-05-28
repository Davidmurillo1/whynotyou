## 1. Migración SQL: tabla `session_steps` y RPC plural

- [x] 1.1 Crear archivo `supabase/migrations/<timestamp>_session_steps.sql` con `CREATE TABLE public.session_steps` (PK compuesta `(session_id, step_id)`, `user_id`, `completed_in_session boolean`, `created_at timestamptz`, FKs con `ON DELETE CASCADE`).
- [x] 1.2 Habilitar RLS en `session_steps` y crear policies `select`/`insert`/`delete` filtradas por `auth.uid() = user_id`.
- [x] 1.3 Crear índices `session_steps_step_idx (step_id)` y `session_steps_user_idx (user_id)`.
- [x] 1.4 Escribir el backfill: `INSERT INTO session_steps ...` (user_id via JOIN con items porque sessions no tiene la columna directamente).
- [x] 1.5 Crear o reemplazar la RPC `public.create_session_with_steps(...)` siguiendo el pseudo-código de design.md.
- [x] 1.6 NO dropear `sessions.step_id` en esta migración (queda como follow-up).
- [x] 1.7 Ejecutar la migración contra la DB de Supabase (`apply_migration` MCP) y verificar con `list_migrations` que aparece.
- [x] 1.8 Verificar con un query manual que las sesiones existentes tienen su fila en `session_steps` post-backfill (0 sesiones históricas con step_id — DB limpia).

## 2. Schema Zod y server action

- [x] 2.1 En `src/lib/items/schemas.ts`: agregar `sessionStepSchema` y modificar `createSessionSchema` para aceptar `steps: z.array(sessionStepSchema).max(50).optional()`. Marcar `step_id` y `complete_step` como **deprecated** pero seguir aceptándolos (compatibilidad).
- [x] 2.2 Exportar tipo `SessionStepInput = z.infer<typeof sessionStepSchema>` y actualizar `CreateSessionInput`.
- [x] 2.3 En `src/lib/actions/sessions.ts`: ampliar `createSessionAction` para aceptar `steps`. Si recibe el par viejo `step_id`/`complete_step` y no recibe `steps`, traducirlo internamente a `steps: [{ step_id, complete: complete_step }]`.
- [x] 2.4 Reemplazar la llamada al RPC singular por la nueva `create_session_with_steps` cuando `steps.length > 0`. Si `steps` está vacío o ausente, hacer el insert directo en `sessions` como hoy (sin pasar por RPC).
- [x] 2.5 Mapear los errores `STEP_NOT_FOUND` / `ITEM_NOT_FOUND` / `ITEM_NOT_OWNED` del RPC a mensajes en español como ya hace la versión actual.
- [x] 2.6 Conservar todos los `revalidatePath` actuales (`/dashboard`, `/biblioteca`, `/stats`, `/categorias`, `/item/[id]`).
- [x] 2.7 Recalcular `itemCompleted` igual que hoy (por unidades **o** por todos los pasos en `is_done`).

## 3. UI: rediseño de la fase `capture` en `SessionRunner`

- [x] 3.1 En `src/app/(app)/item/[id]/sesion/page.tsx`: pasar a `SessionRunner` también `parent_step_id` y `progress_mode` de cada paso (ya se traen, sólo agregarlos al map).
- [x] 3.2 En `session-runner.tsx`: reemplazar el estado `selectedStepId: string` + `completeStep: boolean` por `selections: Map<step_id, { selected: boolean, complete: boolean }>` (o un `Record`).
- [x] 3.3 Reemplazar el `<select>` por una lista renderizada custom agrupada en "Pendientes" y "Ya completados", preservando el orden por `position`.
- [x] 3.4 Renderizar cada paso con un checkbox principal "trabajé acá" + checkbox secundario "Terminé" condicional según los siguientes casos:
  - **Pendiente, sin hijos**: ambos checkboxes visibles y habilitados.
  - **Pendiente, módulo con hijos**: checkbox principal visible; "Terminé" visible pero deshabilitado con tooltip "Se completa cuando termines todas sus tareas".
  - **Ya completado**: checkbox principal visible; "Terminé" oculto.
- [x] 3.5 Cuando el usuario marca "Terminé", aplicar `line-through` + `opacity-70` al nombre del paso en vivo.
- [x] 3.6 Indentar visualmente las tareas hijas debajo de su módulo (margen izquierdo en el render).
- [x] 3.7 Quitar el `targetUnits` cuando `hasSteps` es true (ya hoy se hace; verificar que sigue así).
- [x] 3.8 En `handleSave`, construir `steps` filtrando `selections` por `selected = true` y mapeando a `{ step_id, complete }`. Llamar a `createSessionAction` con `steps` (sin `step_id`/`complete_step`).
- [x] 3.9 Ajustar el cálculo del `celebrationTier`: `large` si `itemCompleted`, `medium` si al menos una selección tiene `complete = true`, `small` si no.

## 4. Lecturas que dependen de `sessions.step_id`

- [x] 4.1 `grep` por usos de `step_id` en `src/` — solo `sessions.ts` y `session-runner.tsx` accedían a `sessions.step_id` (el resto usa `parent_step_id` de `item_steps`).
- [x] 4.2 Para cada lectura encontrada: `highlights.ts`, dashboard, item detail — ninguno lía `sessions.step_id`. Sin cambios necesarios.
- [x] 4.3 En `src/lib/highlights.ts`: confirmado que no consulta `sessions.step_id`. Sin cambios.
- [x] 4.4 `src/app/(app)/item/[id]/page.tsx` no muestra el paso asociado a cada sesión — sin cambios necesarios.

## 5. Verificación end-to-end

- [ ] 5.1 Levantar `npm run dev` y verificar el flujo completo: arrancar cronómetro en un ítem con pasos → terminar → seleccionar 3 tareas → marcar 2 como "Terminé" → guardar.
- [ ] 5.2 Verificar en Supabase: una fila nueva en `sessions` (sin `step_id`), tres filas en `session_steps`, dos pasos con `is_done = true` y `done_at` poblado.
- [ ] 5.3 Verificar el tachado en vivo en la pantalla de captura antes de guardar.
- [ ] 5.4 Verificar el flujo de ítem sin pasos: sigue funcionando como antes (input "Avancé hasta X", sin lista de pasos).
- [ ] 5.5 Verificar que un ítem con todos sus pasos completados marca `status = 'done'` y redirige a `/item/[id]/completado`.
- [ ] 5.6 Verificar que las stats semanales y el dashboard siguen mostrando el tiempo correcto sin duplicación.
- [x] 5.7 Ejecutar `npm run lint` y confirmar que no aparecen errores nuevos sobre los 5 preexistentes documentados en CLAUDE.md. ✓ (5/5 solo los preexistentes)

## 6. Limpieza

- [x] 6.1 Eliminar referencias en código a la RPC vieja `create_session_with_step` (singular) — ya no la usa nadie en el código TS. La función SQL queda en la DB hasta un follow-up change.
- [x] 6.2 `openspec/specs/item-steps/spec.md` será sincronizada por `openspec archive` cuando se cierre el change.
- [ ] 6.3 Commit con mensaje en español, conciso, en línea con los anteriores del repo.
