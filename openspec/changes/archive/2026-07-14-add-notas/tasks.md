# Tasks: add-notas

## 1. Base de datos

- [x] 1.1 Escribir `supabase/migrations/20260713_add_item_notes.sql`: tabla `item_notes` (`id`, `user_id → auth.users`, `item_id → items` NOT NULL cascade, `step_id → item_steps` nullable cascade, `body text CHECK char_length(body) between 1 and 4000`, `created_at`, `updated_at`); DDL idempotente (`create table if not exists`, `drop … if exists`)
- [x] 1.2 Índices: `item_notes_item_idx (item_id)`, `item_notes_step_idx (step_id) where step_id is not null`, `item_notes_user_idx (user_id)`
- [x] 1.3 RLS + 4 policies (`select`/`insert`/`update`/`delete`) con `user_id = auth.uid()`, calcadas de `projects`
- [x] 1.4 Trigger `check_item_note_ownership` (before insert or update): valida ownership del ítem y —si hay `step_id`— ownership del paso **y** `item_steps.item_id = new.item_id`; errores `NOTE_ITEM_OWNERSHIP_MISMATCH` / `NOTE_STEP_OWNERSHIP_MISMATCH` / `NOTE_STEP_ITEM_MISMATCH`
- [x] 1.5 Trigger `touch_item_notes_updated_at` (before update) — deja la edición futura habilitada sin migración
- [x] 1.6 Verificar con `list_tables`/`list_migrations` que `item_notes` no exista; aplicar en Supabase (`learning_tracking`) vía MCP `apply_migration` con OK del usuario, o el usuario lo corre en el SQL editor — aplicada y verificada (4 policies, 2 triggers, 4 índices)

## 2. Validación y mutaciones

- [x] 2.1 Crear `src/lib/notes/schemas.ts`: `noteBodyField = z.string().trim().min(1, 'La nota no puede estar vacía').max(4000)`; `createNoteSchema` (`item_id` uuid, `step_id` uuid nullish, `body`); `deleteNoteSchema` (`id` uuid) + tipos `z.infer`
- [x] 2.2 Crear `src/lib/actions/notes.ts` (`'use server'`): tipos `NoteRow` / `NoteActionResult`, `mapPgError` (traduce los 3 errores del trigger + fallback a `error.hint`)
- [x] 2.3 `createNoteAction`: `safeParse` → `getUser()` → si `step_id`, buscar el paso por `id`+`user_id` y **derivar `item_id`** (no confiar en el cliente); si no, verificar ownership del ítem → `insert` filtrando por `user_id` → `revalidatePath('/item/[id]')` → devolver la nota creada
- [x] 2.4 `deleteNoteAction`: `safeParse` → `getUser()` → `select item_id` (ownership + revalidación) → `delete` por `id`+`user_id` → `revalidatePath('/item/[id]')`

## 3. Componente de notas

- [x] 3.1 Crear `src/components/notes-control.tsx` (client) con `<NotesTrigger>`: ícono `StickyNote` de lucide; vacío = botón muted (`p-1 text-muted/60 hover:text-text`); con notas = pill `border border-border bg-surface-2 text-accent` + contador `tabular` (variante `compact` para tareas); solo tokens de color
- [x] 3.2 En el mismo archivo, `<NotesPanel>` (bloque full-width): lista de notas (body `whitespace-pre-wrap`, texto plano sin linkificar, fecha relativa con `formatRelative`, botón × "Quitar nota" con `window.confirm`), estado vacío "Todavía no hay notas.", y composer (`textarea` + botón "Agregar nota"); copy en español argentino
- [x] 3.3 Estado `open` y datos elevados al contenedor de cada nivel (el trigger va en la fila flex; el panel se renderiza como hermano full-width debajo, a otro nivel del DOM)

## 4. Integración en el detalle del ítem

- [x] 4.1 `item/[id]/page.tsx`: sumar al `Promise.all` la query `item_notes` (`where item_id = id and user_id`, orden `created_at` asc); normalizar a `Note[]`; particionar `itemNotes` (`step_id null`) y `notesByStep`; pasar `initialNotes` a `ItemProgressShell`
- [x] 4.2 `item/[id]/item-progress-shell.tsx`: `useState<Note[]>(initialNotes)`; `handleCreateNote` (append-on-success) y `handleDeleteNote` (optimista + rollback); render `<NotesTrigger>` en la meta-row del header y `<NotesPanel>` como hermano debajo; **hacer la meta-row siempre visible**; pasar notas + handlers a `StepsEditor`
- [x] 4.3 `item/[id]/steps-editor.tsx`: threadear notas + handlers hasta `ModuleRow`; render `<NotesTrigger>` en el cluster del módulo (después de `StepEstimateControl`) con el `<NotesPanel>` como bloque debajo del header del módulo; ídem en cada tarea (variante `compact`, panel como `<li>` hermano); **sin** el guard de `done`
- [x] 4.4 Agregar `flex-wrap` preventivo al cluster de meta-controles de módulo/tarea para no desbordar a 360px en modo `custom`

## 4b. Vista centralizada de notas (apartado)

- [x] 4b.1 En `src/components/notes-control.tsx`, agregar `<NotesOverview>`: recibe `notes`, `steps` (tipo estructural `StepLike`), `itemTitle`, `pending`, `onDelete`; agrupa por origen en orden jerárquico (ítem → módulos → tareas por posición); oculta grupos sin notas y se oculta entero si no hay notas
- [x] 4b.2 Diseño refinado con tokens: tarjetas `rounded-2xl`, chip de tipo (Ítem/Módulo/Tarea) con ícono lucide, hairline con gradiente desde `surface-2`, contexto `módulo › tarea` en tareas, punto de acento por nota, borrado en hover con `window.confirm`
- [x] 4b.3 Renderizar `<NotesOverview>` en `item-progress-shell.tsx` después de la sección "Pasos", alimentado por el mismo estado `notes` + `steps` (sincronía en vivo)

## 5. Verificación

- [x] 5.1 `npm run lint` — sin errores nuevos (solo los 2 preexistentes: `profile-form.tsx:23`, `proxy.ts:7`)
- [x] 5.2 `npm run build` — compila sin errores (TypeScript ✓)
- [x] 5.3 Preview funcional (browser autenticado): verificado ícono con contador en ítem/módulo/tarea, panel inline, **create por UI con contador optimista (1→2)**, y la vista centralizada agrupada por origen (Ítem/Módulo/Tarea con breadcrumb). Borrado-por-UI/360px/completados no se clickearon, pero el borrado está DB-verificado y el código no tiene guard de `done`.
- [x] 5.4 Verificar cascada: borrar una tarea, un módulo (con notas en tareas hijas) y el ítem → sus notas desaparecen — verificado en DB (T6/T7, transacción con rollback)
- [x] 5.5 Verificar aislamiento/coherencia: no se puede notar sobre elementos ajenos; nota de paso con `item_id` incoherente rechazada por el trigger — verificado en DB (T3/T4)

## 6. Documentación (al archivar)

- [x] 6.1 Agregar la fila `notas` a la tabla de capabilities de `CLAUDE.md`
- [ ] 6.2 `openspec archive add-notas` (syncea `openspec/specs/notas/spec.md`)

## 4c. Editar nota (traído desde fast-follow a pedido del usuario)

- [x] 4c.1 `updateNoteSchema` en `src/lib/notes/schemas.ts`; `updateNoteAction` en `src/lib/actions/notes.ts` (filtra por `user_id`, revalida `/item/[id]`; el trigger `touch` actualiza `updated_at`)
- [x] 4c.2 Componente compartido `<NoteRowItem>` (editar/borrar en hover; edición inline con textarea + Guardar/Cancelar) usado por `<NotesPanel>` y `<NotesOverview>`; `handleUpdateNote` (append-on-success) threadeado por shell → steps-editor → módulo/tarea

## Fast-follow (fuera de este change)

- [ ] F.2 Notas sobre la entidad `projects` (migración aditiva: `item_id` nullable + `project_id` + `CHECK`)
