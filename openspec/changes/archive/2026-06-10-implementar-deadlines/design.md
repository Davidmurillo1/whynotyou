# Design: implementar-deadlines

## Context

La app tiene una jerarquía de tres niveles: **proyectos** (N:M sobre ítems vía `project_items`) → **ítems** → **pasos** (`item_steps`, donde los raíz son "módulos" y los hijos "tareas"). Ninguna tabla tiene fecha límite hoy (confirmado contra Supabase, proyecto `learning_tracking`). El perfil del usuario tiene `timezone` (default `'UTC'`), ya usada por el dashboard para calcular "hoy". `date-fns 4` y `lucide-react` ya están instaladas. La navegación tiene 6 entradas y la nav móvil es un `grid grid-cols-6` de solo texto que ya está al límite de ancho en 390px.

Restricciones del proyecto: dark-only, español argentino, tokens de color propios (`globals.css`), Server Components por defecto, Server Actions para mutaciones con Zod + filtrado por `user_id`, rutas en español, sin dependencias nuevas si lo existente alcanza.

## Goals / Non-Goals

**Goals:**

- Fecha límite **opcional** en proyectos, ítems, módulos y tareas, asignable y removible desde los flujos donde ya se editan esas entidades.
- Una sección única (`/agenda`) que concentre **todos** los deadlines pendientes y se pueda leer en tres modos: lista por urgencia, calendario mensual y línea de tiempo con progreso.
- Lenguaje visual de urgencia consistente en toda la app (un solo componente badge, un solo set de niveles).
- "Hoy" calculado siempre con la timezone del perfil, server-side, para que vencido/hoy/mañana no dependa del reloj del browser.
- Cero dependencias nuevas; queries one-shot sin N+1 (patrón ya establecido en biblioteca y dashboard).

**Non-Goals:**

- Recordatorios/notificaciones por email o push de deadlines (los `reminders` existentes son de hábito diario; integrar deadlines ahí es un change futuro).
- Deadlines con hora del día (`date`, no `timestamptz`).
- Deadlines recurrentes, repetición o snooze.
- Reprogramación masiva, drag & drop en el calendario, o edición de deadlines desde la agenda (la agenda navega a la entidad; la edición vive donde ya se edita cada entidad).
- Auto-cambio de estado de entidades vencidas (un deadline vencido informa, no muta nada).

## Decisions

### D1 — Columna `deadline date` por tabla, no tabla polimórfica

Una columna nullable en `items`, `projects` e `item_steps`.

- **Alternativa descartada**: tabla `deadlines(entity_type, entity_id, due_date)`. Evitaría 3 ALTER, pero pierde FKs reales, complica RLS (no hay join natural), y obliga a un join extra en cada listado. Para 3 tablas conocidas y estables, la columna directa es más simple, más rápida y se borra en cascada gratis.
- Sin `NOT NULL`, sin default, sin backfill: el feature es 100% opt-in y la migración es trivialmente reversible.

### D2 — Tipo `date` interpretado en la timezone del perfil

Un deadline es un **día**, no un instante. Se persiste `date` (`YYYY-MM-DD`) y toda comparación ("vencido", "hoy", "mañana", grupos de la lista, dots del calendario) se computa **server-side** contra el "hoy" derivado de `profiles.timezone` (mismo patrón que `dashboard/page.tsx`). El cliente recibe el `today` como string `YYYY-MM-DD` en props y nunca recalcula con su propio reloj.

- **Alternativa descartada**: `timestamptz` con hora. Agrega un picker de hora que nadie pidió, problemas de DST y la falsa precisión de "vence a las 23:59".

### D3 — Ruta `/agenda`, label "Agenda"

- Cumple "rutas en español". "Agenda" abarca las tres vistas (lista, calendario, timeline) y es el término humano; "vencimientos" suena a facturas y "plazos" a trámite. En la copy interna el campo se llama **"Fecha límite"** y los estados usan "Vence hoy / Venció / Vence en N días".

### D4 — Página server-fetch + tres vistas client-side conmutables

`agenda/page.tsx` (Server Component) hace el fetch completo y computa las entradas normalizadas; un client component (`agenda-views.tsx`) conmuta entre las tres vistas con un segmented control. La vista elegida se recuerda en `localStorage` (`wny:agenda:view`), default **Lista**.

- Dataset chico (app personal): traer todo de una y conmutar client-side da cambio de vista instantáneo, sin spinners — sensación "Apple".
- **Alternativa descartada**: query param `?vista=`. Permite deep-link pero fuerza round-trip por cambio de vista y ensucia el historial de navegación. La preferencia recordada es mejor UX para uso diario.

Modelo normalizado que reciben las tres vistas:

```ts
type DeadlineEntry = {
  entityType: 'project' | 'item' | 'module' | 'task'
  id: string
  title: string
  contextLabel: string | null   // tarea/módulo → título del ítem; ítem → 1er proyecto
  deadline: string              // YYYY-MM-DD
  href: string                  // /proyectos/[id] o /item/[id]
  progress: number | null      // 0..1 si la entidad tiene progreso medible
  urgency: 'overdue' | 'today' | 'soon' | 'later'
  daysLeft: number             // negativo si venció
}
```

### D5 — Fuentes de datos: 5 queries paralelas, cruce en memoria

Todas one-shot, filtradas por `user_id`, en un `Promise.all`:

1. `items` con `deadline IS NOT NULL` y `status IN ('active','paused')`.
2. `projects` con `deadline IS NOT NULL` y `status = 'active'`.
3. `item_steps` con `deadline IS NOT NULL` e `is_done = false`, con join `items!inner(title, status)` para contexto y para excluir pasos de ítems `done`/`abandoned`.
4. `item_steps` completos de los ítems de (1) — para `computeItemProgress()` (mismo patrón del dashboard).
5. `project_items` de los proyectos de (2) con join a `items(current_units, total_units)` — para el progreso agregado del proyecto.

El helper server-side `fetchDeadlineEntries()` vive en `src/lib/deadlines/queries.ts` y lo comparten `/agenda` (completo) y el dashboard (con `limit`, sin progreso de proyectos si no hace falta).

### D6 — Vista 1: Lista agrupada por urgencia

Grupos en orden fijo: **Vencidos · Hoy · Mañana · Esta semana · Este mes · Más adelante** (semana lunes-domingo y mes calendario, con `date-fns`). Grupos vacíos no se renderizan. Cada fila: ícono del tipo de entidad, título, `contextLabel` en muted, `<DeadlineBadge>` a la derecha y mini progreso si aplica. Toda la fila navega a `href`.

Es la vista default: es la que responde más rápido "¿qué hago primero?".

### D7 — Vista 2: Calendario mensual propio con date-fns

Grid de 7 columnas, semana empieza **lunes**. Cada día con deadlines muestra hasta 3 dots del color de la urgencia más alta de ese día (más un "+N"). Tocar un día lo selecciona y debajo del grid aparece la lista de ese día (mismas filas que la vista lista). Header con `‹ mes ›` y botón "Hoy". Días de otros meses atenuados; el día actual con anillo `accent`.

- **Alternativa descartada**: librería de calendario (react-day-picker, etc.). Es un grid de 42 celdas con `eachDayOfInterval` — no justifica una dependencia ni el CSS que habría que pelear para el dark theme.

### D8 — Vista 3: Línea de tiempo ("pista de aterrizaje") — la recomendada

La vista de alto nivel que cruza **tiempo restante × progreso actual**, que ninguna app de calendario da:

- Eje horizontal: desde **hoy** hasta `max(deadline más lejano, hoy + 4 semanas)`, clampeado a 12 semanas (lo que cae después se ancla al borde derecho con sufijo "+"). Marcas de referencia: Hoy / 1 sem / 2 sem / 1 mes.
- Una fila por entidad pendiente, ordenada por deadline ascendente: título + contexto arriba; debajo una barra desde el borde izquierdo (hoy) hasta su deadline — el **largo es el tiempo que queda** — del color de su urgencia; al final de la fila, el % de progreso actual si la entidad lo tiene.
- Los vencidos no tienen "pista": van en una franja propia arriba, en danger, con "Venció hace N días".
- Implementación: divs con `width: %` calculado server-side — sin Recharts, sin canvas.

La señal que entrega: barra corta + progreso bajo = problema; barra larga + progreso alto = tranquilo.

### D9 — Urgencia: 4 niveles, un solo componente

`src/lib/deadlines/utils.ts` define el cálculo; `src/components/deadline-badge.tsx` lo renderiza en toda la app (agenda, dashboard, biblioteca, detalle de ítem, steps editor, detalle de proyecto):

| Nivel | Condición | Color | Copy ejemplo |
|---|---|---|---|
| `overdue` | `deadline < hoy` | `danger` | "Venció ayer" / "Venció hace 5 días" |
| `today` | `= hoy` | `warning` | "Vence hoy" |
| `soon` | `≤ hoy + 7 días` | `warning` | "Vence mañana" / "Vence en 5 días" |
| `later` | resto | `muted` | "12 de agosto" |

Se agrega el token `--color-warning: #f0c75e` a `globals.css` (ámbar, distinto del naranja `streak` y del rojo `danger`). Es extensión del sistema de tokens, no un color hardcodeado.

### D10 — Input nativo `<input type="date">`

Para asignar la fecha en forms y editores se usa el control nativo del sistema (en iOS/Android abre el picker del SO — exactamente lo que haría Apple), estilado con los tokens del proyecto. `color-scheme: dark` ya está seteado en `html`, así que el picker respeta el dark theme. Quitar la fecha es un botón "Quitar" que setea `null`.

- **Alternativa descartada**: datepicker custom. Mucho CSS y a11y para empatar algo que el SO ya hace mejor.

### D11 — Mutaciones: extender actions existentes

Sin módulo de actions nuevo para asignar fechas; el deadline es un campo más de cada entidad:

- `createItemAction` / `updateItemFieldsAction` (+ `deadline` en `createItemSchema` y `updateItemFieldsSchema`).
- `createProjectAction` / `updateProjectAction` (+ `deadline` en schemas de projects).
- `updateStepAction` (+ `deadline`) para módulos y tareas desde el `StepsEditor`.

Validación Zod compartida en `src/lib/deadlines/schemas.ts`: string `YYYY-MM-DD` válido o vacío (→ `null`). Se aceptan fechas pasadas (registrar un deadline ya vencido es legítimo); rango de sanidad 2000-01-01 a +50 años. Cada action mantiene el patrón: Zod → `getUser()` → mutación filtrada por `user_id` → `revalidatePath` de las rutas afectadas (incluida `/agenda`).

### D12 — Navegación: 7 entradas, nav móvil pasa a ícono + label

"Agenda" entra entre "Hoy" y "Biblioteca" (header desktop y nav móvil). Con 7 columnas el texto solo no entra en 390px, así que la nav móvil pasa a **ícono (lucide, 20px) + label (10px)** estilo tab bar de iOS: `House`, `CalendarDays`, `Library`, `FolderKanban`, `Tags`, `BarChart3`, `Settings`. El header desktop sigue siendo solo texto (espacio sobra).

- **Alternativa descartada**: no poner Agenda en el nav y linkear solo desde el dashboard. Mata la descubribilidad de la sección que es el corazón del change.
- Esto modifica el requirement de navegación de la spec `projects` (fijaba 6 entradas y `grid-cols-6`) → delta MODIFIED.

### D13 — Dashboard: módulo "Vence pronto"

Entre el saludo y los ítems: hasta 3 entradas (vencidos primero, luego por cercanía) con `<DeadlineBadge>` y link "Ver agenda →". Si no hay ningún deadline pendiente, el módulo no se renderiza (cero ruido para quien no usa fechas). Tocar `dashboard/page.tsx` obliga (CLAUDE.md) a corregir el lint preexistente `react-hooks/purity` (Date.now en render, línea 64): el cálculo de `daysSinceLastSession` se mueve fuera del render puro (se deriva del `todayLocal` ya computado).

## Risks / Trade-offs

- **[Timezone]** Cálculos de "hoy" duplicados server/client podrían divergir → mitigación: el server computa `today` (string) y agrupa/clasifica todo; el cliente solo renderiza props. El calendario navega meses client-side pero compara contra el `today` recibido.
- **[Nav móvil apretada]** 7 columnas con labels de 10px en pantallas de 360px → mitigación: íconos arriba del label, `truncate`, y verificación manual en viewport 360/390 antes de cerrar el change.
- **[Agenda con muchas entradas]** Cientos de pasos con fecha harían crecer la página → aceptado: app personal mono-usuario; los grupos por urgencia y el orden por fecha mantienen lo importante arriba. Sin paginación en v1.
- **[Pasos vencidos de ítems pausados]** Un ítem `paused` con deadline sigue apareciendo (decisión deliberada: pausar no borra el compromiso) → la fila muestra el estado del ítem para dar contexto.
- **[Input date nativo]** Render del icono del picker varía entre browsers → aceptado; `color-scheme: dark` cubre lo esencial y el fallback siempre es tipeable.
- **[5 queries en /agenda]** Más latencia que una sola RPC → aceptado: son one-shot paralelas sobre tablas chicas con índice por PK/user_id; muy por debajo del costo de un N+1 y sin SQL nuevo que mantener.

## Migration Plan

1. Migración SQL aditiva (vía MCP `apply_migration` de Supabase, proyecto `learning_tracking`):
   ```sql
   alter table public.items add column deadline date;
   alter table public.projects add column deadline date;
   alter table public.item_steps add column deadline date;
   ```
   RLS existente por tabla ya cubre la columna; sin políticas nuevas ni backfill.
2. Deploy del código (la columna nullable es invisible para el código viejo — orden seguro: primero DB, después app).
3. Rollback: revertir el deploy; si hace falta, `drop column deadline` en las tres tablas (sin efecto sobre otros datos).

## Open Questions

- ¿Integrar deadlines a los `reminders` (email "te vence mañana")? Fuera de alcance acá; candidato natural a próximo change una vez que existan datos de uso.
- ¿Mostrar deadlines de ítems `done` recientes en la agenda como "cumplidos" (modo retrospectiva)? V1 los excluye; revisitar si se extraña.
