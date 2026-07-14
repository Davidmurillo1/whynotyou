# Proposal: add-notas

## Why

La app registra **cuánto** avanzaste y **para cuándo**, pero no tiene dónde guardar el **contexto**: la spec que te pasó el cliente, un recordatorio sobre un módulo, el motivo por el que una tarea quedó trabada. Hoy eso vive fuera de la app (cabeza, papel, chat), desconectado del ítem al que pertenece. Existe `sessions.note`, pero es una nota efímera atada a una sesión puntual — no sirve para anotar sobre el ítem, un módulo o una tarea de forma persistente.

El usuario pidió poder agregar **1 o más notas a cualquier elemento** —el ítem completo ("el proyecto en general"), un módulo o una tarea— con un requisito de UX explícito: **que no sature la interfaz**, sino que mediante un **ícono de notas** se vea de un vistazo si el elemento ya tiene alguna y se puedan **escribir más**.

## What Changes

- **Modelo de datos**: nueva tabla `item_notes` (1:N, notas discretas). Cada fila es una nota con `body`, `created_at` y un `item_id` **siempre presente** más un `step_id` **nullable**: `step_id = null` → nota del ítem ("proyecto en general"); `step_id` seteado → nota de un módulo o una tarea (ambos son `item_steps`). Denormalizar `item_id` en toda nota permite traer las notas del ítem **y** de todos sus pasos con **una sola query**.
- **Ícono de notas** (`<NotesTrigger>`, lucide `StickyNote`) en tres lugares del detalle del ítem: header del ítem (junto a categoría/deadline), fila de cada módulo y fila de cada tarea. Dos estados: **apagado** (muted, descubrible aunque no haya notas) y **con notas** (pill con acento + contador).
- **Panel de notas inline** (`<NotesPanel>`) que se despliega bajo el elemento al tocar el ícono: lista de notas existentes (texto plano, con su fecha y un botón para quitar) + un composer para agregar una nueva. Sin modales ni popovers — inline-expand, el patrón que ya usa toda la app.
- **Mutaciones**: `createNoteAction` y `deleteNoteAction` (Server Actions con Zod + filtrado por `user_id`). La edición de notas queda como fast-follow (la tabla ya deja `updated_at` listo).
- **Visibilidad en completados**: a diferencia del deadline (que se oculta en `done`), las notas **siguen visibles y agregables** en ítems, módulos y tareas completados — son historial que se consulta y amplía después de terminar.
- Sin breaking changes: tabla nueva aditiva, sin tocar datos existentes, sin dependencias nuevas.

## Capabilities

### New Capabilities

- `notas`: notas discretas (1:N) sobre ítems, módulos y tareas; ícono indicador con contador que no satura la UI; panel inline para leer y agregar; crear/borrar vía Server Actions; visibles también en elementos completados. La entidad `projects` (`/proyectos`) queda **fuera de alcance** por ahora (extensión aditiva futura).

### Modified Capabilities

- Ninguna. El ícono se suma a las filas de `item-steps` y al header del ítem de forma **aditiva** — no cambia ningún requirement observable existente.

## Impact

- **DB (Supabase, proyecto `learning_tracking`)**: migración aditiva — nueva tabla `item_notes` con RLS (4 policies), trigger de ownership/coherencia (`check_item_note_ownership`), trigger de `updated_at` e índices. Verificado contra el schema live: `item_notes` no existe, las FK apuntan a `auth.users`, y `item_steps.parent_step_id` es `ON DELETE CASCADE` (borrar un módulo limpia las notas de sus tareas).
- **Código nuevo**: `src/lib/notes/schemas.ts`, `src/lib/actions/notes.ts`, `src/components/notes-control.tsx` (`<NotesTrigger>` + `<NotesPanel>`), `supabase/migrations/20260713_add_item_notes.sql`.
- **Código modificado**: `src/app/(app)/item/[id]/page.tsx` (query + particionado de notas), `item/[id]/item-progress-shell.tsx` (estado controlled + handlers + ícono de nivel ítem), `item/[id]/steps-editor.tsx` (ícono + panel por módulo y por tarea).
- **Dependencias**: ninguna nueva — `lucide-react` (ícono) y el patrón de Server Actions ya están.
- **Specs**: nueva `openspec/specs/notas/spec.md`. Sin deltas MODIFIED.
- **Acción requerida del usuario**: aplicar la migración en el SQL editor de Supabase (o autorizar aplicarla vía MCP `apply_migration`). El archivo `.sql` se committea; el DDL es idempotente.
