## Why

Hoy, al terminar una sesión cronometrada de un ítem con pasos, el usuario sólo puede asociar la sesión a **un único paso** y opcionalmente marcarlo como completado. En la práctica, una sesión real suele tocar varias tareas a la vez (por ejemplo, "estuve 1h trabajando en 1.2, 2.3 y 2.5"), y el flujo actual obliga a elegir una sola o registrar varias sesiones ficticias —lo que infla el tiempo total en stats y rompe la cuenta real de la sesión.

La mejora permite seleccionar **múltiples tareas** al cerrar la sesión y marcar individualmente cuáles se terminaron y cuáles sólo avanzaron, sin duplicar tiempo en las estadísticas.

## What Changes

- **BREAKING (DB)**: agregar tabla puente `session_steps (session_id, step_id, completed_in_session)` para asociar una sesión a N pasos. Migrar el dato actual de `sessions.step_id` a la nueva tabla y deprecar la columna single-valued (mantenerla por compatibilidad o eliminarla en una migración separada).
- **Server Action `createSessionAction`**: aceptar un nuevo input `steps: Array<{ step_id, complete }>` en reemplazo del par `step_id`/`complete_step`. El input antiguo se sigue aceptando temporalmente y se traduce internamente.
- **RPC**: extender o reemplazar `create_session_with_step` por una variante que reciba un array de pasos y, en una sola transacción, inserte la sesión, las filas en `session_steps` y los `is_done = true` para los pasos marcados como completados.
- **UI `SessionRunner` (pantalla "Sesión terminada")**:
  - Reemplazar el `<select>` único por una **lista jerárquica** agrupada por módulo donde cada paso tiene su checkbox "trabajé acá" + checkbox "Terminé" anidado.
  - El listado preserva los grupos actuales: "Pendientes" (incluyendo módulos con o sin tareas) y "Ya completados".
  - Para módulos con tareas hijas, el checkbox "Terminé" queda deshabilitado (su `is_done` es derivado — regla ya existente en `item-steps`).
  - Cuando el usuario marca "Terminé" en al menos una tarea, mostrar visualmente el efecto (la tarea aparece tachada en la propia pantalla antes de guardar).
- **No cambia**: el cálculo de `units_progressed` (sigue 0 cuando hay pasos), ni el cálculo de `itemCompleted`, ni el flujo de redirección a `/completado`.

## Capabilities

### New Capabilities
*(ninguna nueva)*

### Modified Capabilities
- `item-steps`: el requisito "Sesiones pueden referenciar un paso" pasa a permitir N pasos por sesión y agrega la noción de "completado en esta sesión" para tachado visual. Se agregan escenarios de selección múltiple, módulos no completables, y deduplicación de tiempo en stats.

## Impact

- **DB**: nueva tabla `session_steps` con RLS y FKs (`ON DELETE CASCADE` desde `sessions`, `ON DELETE SET NULL` desde `item_steps` para preservar historial). Migración de datos existentes en `sessions.step_id`.
- **Server Actions**: `src/lib/actions/sessions.ts` — cambia firma de `createSessionAction`; `src/lib/items/schemas.ts` — nuevo schema Zod `createSessionSchema` con `steps[]`.
- **RPC Postgres**: reemplazar/extender `create_session_with_step` por `create_session_with_steps` (plural).
- **UI**: `src/app/(app)/item/[id]/sesion/session-runner.tsx` — reescribe la fase `capture`; `src/app/(app)/item/[id]/sesion/page.tsx` — cargar también los `parent_step_id` para agrupar por módulo (ya lo hace).
- **Stats**: cambian las queries que cuentan tiempo por paso (si las hubiera) — ahora deben hacer `JOIN session_steps` en lugar de filtrar por `sessions.step_id`. Verificar dashboard, stats semanales y heatmap.
- **Compatibilidad**: las sesiones históricas con `step_id` se migran a una fila en `session_steps`; las que no tenían paso quedan sin filas asociadas (equivalente al `step_id = null` actual).
