# Design: add-notas

## Context

El detalle del ítem (`/item/[id]`) tiene una jerarquía de dos tablas: el **ítem** (`items`) y sus **pasos** (`item_steps`, donde los raíz son "módulos" y los hijos "tareas", máximo 1 nivel de anidación). Cuando el usuario dice "el proyecto en general, el módulo o la tarea", se refiere a esos elementos — **no** a la entidad `projects` (la agrupación N:M de `/proyectos`, que es otra cosa).

El header y el editor de pasos comparten estado en el cliente vía `ItemProgressShell` (`useState<Step[]>` controlled), para que tachar/agregar refleje al instante en el `ProgressRing` sin `router.refresh()`. Cada fila de paso ya tiene dos controles con la forma "ícono cuando vacío / chip cuando hay valor": `StepDeadlineControl` (se **oculta** en `done`) y `StepEstimateControl` (se **mantiene** en `done`). Existe `sessions.note` (una nota singular por sesión), dominio distinto que no se reutiliza.

Verificado contra Supabase (`learning_tracking`, ref `wcsilqfdbhvpqnaavtvn`): la tabla `item_notes` no existe; las FK de `items`/`item_steps`/`projects` referencian `auth.users(id)` (no `profiles`); `items.id` es `uuid`; `item_steps_parent_step_id_fkey` es `ON DELETE CASCADE`.

Restricciones del proyecto: dark-only, español argentino, tokens de color propios, Server Components por defecto, Server Actions con Zod + filtrado por `user_id`, sin dependencias nuevas, sin N+1.

## Goals / Non-Goals

**Goals:**

- Agregar **varias** notas persistentes a un ítem, un módulo o una tarea, y borrarlas.
- Un **ícono** que no sature: muestra si el elemento ya tiene notas (contador) y abre el lugar para leer/escribir.
- Traer todas las notas del ítem y sus pasos **sin N+1** (una query dentro del `Promise.all` que ya existe).
- Actualización **instantánea** del contador al crear/borrar (estado controlled, sin refetch), coherente con cómo ya se comporta el header.
- Notas visibles **también en elementos completados**.

**Non-Goals:**

- Notas sobre la entidad `projects` (`/proyectos`). Queda como migración aditiva futura (ver D2).
- Editar el texto de una nota en el MVP (fast-follow; la DB ya lo deja habilitado, ver D6).
- Rich text, markdown, adjuntos, checklists dentro de una nota, o auto-linkificar URLs (texto plano, ver D7).
- Buscar/filtrar notas globalmente, o una vista de "todas mis notas".
- Reutilizar o migrar `sessions.note`.
- Notas sobre categorías o sesiones.

## Decisions

### D1 — Notas discretas (tabla 1:N), no un textarea único

Cada nota es una fila en `item_notes`. El requisito ("1 o más notas", "ver si ya posee alguna", "escribir más") exige entradas discretas con timestamp y un **contador real** en el ícono, más borrado por entrada.

- **Alternativa descartada**: columna `note text` en `items`/`item_steps` (un bloc que crece). No puede exhibir un número ni preservar cronología ni borrar una entrada puntual. Solo serviría para el modelo "notepad", que el pedido descarta.
- **Alternativa descartada**: tablas separadas (`item_notes`, `step_notes`). Triplican RLS/triggers/actions con columnas idénticas y cero beneficio.

### D2 — Tabla única con `item_id` **denormalizado** + `step_id` nullable

En vez de una tabla polimórfica con `item_id`/`step_id`/`project_id` nullables y un `CHECK num_nonnulls = 1`, se elige: **`item_id NOT NULL` en toda nota** (también las de paso) y `step_id` nullable.

- `step_id = null` → nota del ítem. `step_id` seteado → nota de ese módulo/tarea.
- **Por qué**: permite leer las notas del ítem y de **todos** sus pasos con una sola query `where item_id = X` — sin el problema del huevo-y-la-gallina (los `step_id` no existen todavía cuando arranca el `Promise.all`), sin `embed !inner` frágil, sin segunda pasada. Ver D3.
- **Costo**: este diseño es incompatible con notas de `projects` (una nota de proyecto no tendría `item_id`). Es el trade-off aceptado: se prioriza la lectura de una query sobre soportar `projects` hoy. Si en el futuro se piden notas de proyecto, la extensión es aditiva: relajar `item_id` a nullable, agregar `project_id` nullable + un `CHECK`.
- **Integridad**: el trigger `check_item_note_ownership` valida que el ítem sea del usuario y —si hay `step_id`— que el paso sea del usuario **y** que `item_steps.item_id = new.item_id` (cierra la fuga cross-item por un `item_id` denormalizado inconsistente).

```sql
create table public.item_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id)   on delete cascade,
  item_id    uuid not null references public.items(id) on delete cascade,
  step_id    uuid          references public.item_steps(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### D3 — Lectura: una query en el `Promise.all`, particionado en memoria

En `page.tsx` se suma una query paralela más:

```ts
supabase.from('item_notes')
  .select('id, item_id, step_id, body, created_at')
  .eq('item_id', id).eq('user_id', user!.id)
  .order('created_at', { ascending: true })
```

Tras resolver: `itemNotes = rows.filter(r => r.step_id === null)` va al header; `notesByStep = groupBy(rows con step_id, 'step_id')` se cruza contra los `Step[]` ya cargados. El `body` viene cargado (las notas son pocas y cortas), así que el panel **no hace fetch al abrir**. Orden ascendente (cronológico, tipo libreta) con tiebreak estable `(created_at, id)`.

### D4 — Superficie: inline-expand, no popover/modal/drawer

El repo **no tiene** modales, popovers ni drawers — todo es inline-expand (`ItemDetailsEditor`, `NewTaskForm`/`showTaskForm`, `StepEstimateControl` morfando inline, `window.confirm`). Un popover anclado dentro de contenedores con `overflow` implica clipping/z-index/posicionamiento y un primitivo nuevo. Inline-expand empuja contenido hacia abajo, es seguro a 360px y calca lo existente.

**Refinamiento clave**: el control se parte en dos, porque los tres destinos son **filas flex horizontales** (`items-center`) donde un panel que empuja hacia abajo no puede ser hijo directo:

- `<NotesTrigger>` — el ícono/pill. Vive **dentro** de la fila flex (header del ítem, cluster del módulo, `<li>` de la tarea).
- `<NotesPanel>` — lista + composer. Se renderiza como **bloque full-width hermano, debajo** de la fila, a otro nivel del DOM (en el módulo, junto al bloque de progreso dentro del `<li rounded-xl>`; en la tarea, bajándolo con `basis-full`/`flex-col`).

El estado `open` y los datos se elevan al contenedor de cada nivel.

### D5 — Creación append-on-success (no optimista con id temporal)

`createNoteAction` hace `await` y se agrega la nota **real devuelta** al `useState` (patrón `NewTaskForm`/`onCreated`). El contador se actualiza al resolver el round-trip — trivial para una app personal, y evita reconciliar un id temporal (que rompería un borrado inmediato). El **borrado** sí es optimista con rollback (patrón `handleDelete` de steps), porque opera sobre un id real.

- `revalidatePath('/item/[id]')` **no** refresca la página actual (los steps son estado controlled por diseño); por eso el contador se actualiza en el `useState` del shell. **No** agregar `router.refresh()`: dispararía todas las queries del server component y mataría el update instantáneo del `ProgressRing`.

### D6 — CRUD completo: crear + leer + editar + borrar

Inicialmente la edición se planeó como fast-follow, pero se incluyó a pedido del usuario al cerrar el change. `updateNoteAction` valida con las mismas reglas que crear, persiste el nuevo `body` filtrando por `user_id` y el trigger `touch` actualiza `updated_at` (por eso la DDL ya lo dejaba listo, sin migración adicional). La UI de edición vive en un componente compartido `<NoteRowItem>` usado por `<NotesPanel>` y `<NotesOverview>`: en hover aparecen lápiz (editar) y × (borrar); editar reemplaza el cuerpo por un textarea con Guardar/Cancelar. La edición es append-on-success (await + reemplazo de la nota en el estado), coherente con la creación (D5).

### D7 — Texto plano, borrado con confirmación

El `body` se renderiza como **texto plano** con `whitespace-pre-wrap` (respeta saltos de línea), sin auto-linkificar — React escapa por defecto, mismo criterio seguro que `sessions.note`. Rechazo de notas vacías/solo-whitespace por Zod (`trim().min(1)`) **y** `CHECK char_length between 1 and 4000` (defensa en profundidad). El borrado usa `window.confirm` (coherente con el confirm destructivo de `handleDelete` de steps): una nota puede tener specs largas y no se re-tipea como una fecha.

### D8 — Ubicación e ícono

- **Nivel ítem**: en `item-progress-shell.tsx`, meta-row del header (después de `CategoryBadge`). La row pasa a renderizarse **siempre** (hoy es condicional a categoría/deadline) para que el ícono apagado sea descubrible. Título del panel: "Notas del ítem".
- **Nivel módulo**: en `ModuleRow`, dentro del cluster `flex items-center`, después de `StepEstimateControl`.
- **Nivel tarea**: en el `<li>` de cada tarea, después de `StepEstimateControl compact`, variante compact.
- Ícono `StickyNote` de lucide. Vacío: botón muted (`p-1 text-muted/60 hover:text-text`). Con notas: pill `border border-border bg-surface-2 text-accent` + contador `tabular`.
- **Divergencia deliberada del deadline**: el `NotesTrigger` **no** se envuelve en el guard `!effectivelyDone` / `!task.is_done`. Las notas se mantienen en elementos completados (precedente: `StepEstimateControl` ya se comporta así).
- **360px**: agregar `flex-wrap` al cluster de meta-controles del módulo/tarea (en modo `custom` la fila ya está cargada) para no desbordar.

### D9 — Migración: archivo committeado + aplicar a mano (idempotente)

La carpeta `supabase/migrations/` quedó desactualizada desde `20260602` (deadlines/eficiencia se aplicaron sin archivo). Se committea `20260713_add_item_notes.sql` para higiene del historial y se aplica el **mismo** SQL vía dashboard o MCP `apply_migration`. El DDL es idempotente (`create table if not exists`, `drop policy/trigger if exists`, `create or replace function`), así que una re-ejecución es segura. Preferir `apply_migration` (registra versión) sobre `execute_sql`.

### D10 — Vista centralizada dentro de `ItemProgressShell`, agrupada por origen

Un apartado que reúne todas las notas del ítem, cada una identificada por su origen (ítem / módulo / tarea).

- **Dónde vive**: dentro de `ItemProgressShell`, después de la sección "Pasos". Es el único lugar que ya tiene el estado controlled `notes` **y** los `steps` (para resolver nombres/jerarquía), así que la vista sincroniza en vivo con las altas/bajas de los paneles inline sin segunda fuente de verdad ni refetch.
- **Agrupación**: por origen, en orden jerárquico — notas del ítem primero, luego cada módulo (por `position`) seguido de sus tareas (por `position`). Cada grupo es una tarjeta con un chip de tipo (Ítem / Módulo / Tarea), el nombre y —para tareas— el módulo padre como contexto (`módulo › tarea`).
- **Se oculta si no hay notas** (evita una sección vacía; el ícono del header ya cubre el estado vacío por elemento).
- **Componente**: `<NotesOverview>` en `notes-control.tsx`. Recibe `steps` con un tipo estructural mínimo (`StepLike`) para no crear import circular con `steps-editor.tsx`.
- **Diseño refinado** dentro del sistema dark: tarjetas `rounded-2xl`, hairline con gradiente sutil desde `surface-2`, chip de tipo por origen, punto de acento por nota, borrado en hover. Solo tokens del proyecto (acento con opacidad, sin colores crudos).
- Reusa `onDelete` (con `window.confirm`); no incluye composer (agregar se hace desde el ícono de cada elemento — evita un selector de destino).

## Risks / Trade-offs

- **`item_id` denormalizado**: exige que el trigger valide coherencia `step.item_id = new.item_id`. Mitigado en `check_item_note_ownership`, y el server **deriva** `item_id` del `step_id` (autoritativo) en vez de confiar en el cliente.
- **No soporta `projects` hoy**: aceptado a cambio de la lectura de una query (D2). Extensión aditiva documentada.
- **Contador no instantáneo al crear** (espera el round-trip): trivial en una app personal; se prefiere la simplicidad sobre reconciliar ids temporales (D5).
- **Saturación a 360px**: mitigada con `flex-wrap` preventivo (D8).

## Migration Plan

1. Escribir/committear `supabase/migrations/20260713_add_item_notes.sql`.
2. Verificar con `list_tables`/`list_migrations` que `item_notes` no exista (el DDL es idempotente de todos modos).
3. Aplicar vía `apply_migration` (con OK del usuario) o el usuario lo corre en el SQL editor.
4. Implementar schemas → actions → componente → integraciones.
5. QA (ver tasks): lint sin errores nuevos, 360px, borrado optimista + rollback, cascade, visibilidad en completados.

## Open Questions

- Ninguna bloqueante. Sub-decisiones ya tomadas (con recomendación): orden **ascendente**, máximo **4000** caracteres, **append + delete** en el MVP (editar diferido), borrado **con confirmación**. Revisables si el usuario prefiere otra cosa.
