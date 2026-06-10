# Tasks: implementar-deadlines

## 1. Base de datos y fundamentos

- [x] 1.1 Aplicar migración aditiva en Supabase (`learning_tracking`): `alter table public.items add column deadline date;` + ídem `projects` e `item_steps` (vía MCP `apply_migration`)
- [x] 1.2 Agregar token `--color-warning: #f0c75e` a `@theme` en `src/app/globals.css`
- [x] 1.3 Crear `src/lib/deadlines/schemas.ts`: schema Zod compartido para `deadline` (string `YYYY-MM-DD` válido o `''` → `null`; rango 2000-01-01 a hoy + 50 años; fechas pasadas permitidas)
- [x] 1.4 Crear `src/lib/deadlines/utils.ts`: `todayInTimezone(tz)`, `getUrgency(deadline, today)` (4 niveles), `daysLeft()`, `formatDeadlineLabel()` ("Vence hoy", "Venció hace N días", fecha corta) y agrupador de lista (Vencidos / Hoy / Mañana / Esta semana / Este mes / Más adelante con date-fns, semana lunes-domingo)
- [x] 1.5 Crear `src/components/deadline-badge.tsx`: `<DeadlineBadge urgency label />` con colores `danger` / `warning` / `muted` según nivel

## 2. Mutaciones (asignar / editar / quitar fecha)

- [x] 2.1 Ítems: sumar `deadline` a `createItemSchema` y `updateItemFieldsSchema` (`src/lib/items/schemas.ts`) y persistirlo en `createItemAction` / `updateItemFieldsAction` (`src/lib/actions/items.ts`), revalidando `/agenda` además de las rutas actuales
- [x] 2.2 Pasos: sumar `deadline` al schema/action de actualización de pasos (`src/lib/actions/steps.ts`) para módulos y tareas
- [x] 2.3 Proyectos: sumar `deadline` a los schemas y a `createProjectAction` / `updateProjectAction` (`src/lib/actions/projects.ts`)
- [x] 2.4 UI ítem: campo "Fecha límite (opcional)" con `<input type="date">` en `item/nuevo/item-form.tsx` y en `item/[id]/item-details-editor.tsx` (con botón "Quitar")
- [x] 2.5 UI pasos: control de fecha por paso en `item/[id]/steps-editor.tsx` (asignar/cambiar/quitar) + chip `<DeadlineBadge>` junto al nombre; pasar `deadline` y `today` desde `item/[id]/page.tsx`
- [x] 2.6 UI proyecto: campo "Fecha límite (opcional)" en `proyectos/nuevo/project-form.tsx` y edición/quita en `proyectos/[id]` (form de edición existente)

## 3. Datos de la agenda

- [x] 3.1 Crear `src/lib/deadlines/queries.ts`: `fetchDeadlineEntries(supabase, userId, tz, opts)` con las 5 queries paralelas (ítems pendientes con deadline; proyectos activos con deadline; pasos pendientes con deadline + join al ítem; steps de esos ítems para progreso; `project_items` + items para progreso agregado), cruce en memoria → `DeadlineEntry[]` ordenado por fecha con `urgency` y `daysLeft` resueltos server-side

## 4. Página `/agenda`

- [x] 4.1 Crear `src/app/(app)/agenda/page.tsx` (Server Component, `dynamic = 'force-dynamic'`): fetch de entries + `today` por timezone del perfil; `<EmptyState>` explicativo (sin control de vistas) cuando no hay ningún deadline pendiente
- [x] 4.2 Crear `agenda/agenda-views.tsx` (client): segmented control Lista / Calendario / Línea de tiempo, default Lista, persistencia en `localStorage` (`wny:agenda:view`), conmutación sin refetch
- [x] 4.3 Crear `agenda/deadline-list.tsx`: grupos por urgencia en orden fijo, grupos vacíos ocultos, filas con ícono de tipo, título, contexto jerárquico, `<DeadlineBadge>` y progreso; fila completa navega al `href`
- [x] 4.4 Crear `agenda/deadline-calendar.tsx`: grilla mensual 7 columnas (lunes primero) con date-fns, dots por urgencia (máx 3 + "+N"), día actual con anillo `accent`, días adyacentes atenuados, navegación `‹ ›` + "Hoy", panel inferior con las entradas del día seleccionado
- [x] 4.5 Crear `agenda/deadline-timeline.tsx`: franja de vencidos arriba (sin barra) + filas con barra hoy→deadline (width % server-computado, color por urgencia, clamp 12 semanas con indicador de desborde), marcas Hoy / 1 sem / 2 sem / 1 mes, % de progreso al final de cada fila

## 5. Integraciones en superficies existentes

- [x] 5.1 Navegación (`src/app/(app)/layout.tsx`): entrada "Agenda" entre "Hoy" y "Biblioteca"; nav móvil a `grid-cols-7` con ícono lucide + label (House, CalendarDays, Library, FolderKanban, Tags, ChartColumn, Settings); verificar sin desborde en 360px
- [x] 5.2 Dashboard (`dashboard/page.tsx`): módulo "Vence pronto" (hasta 3 entradas, vencidos primero, link "Ver agenda →", oculto si no hay deadlines) reutilizando `fetchDeadlineEntries` con `limit`; de paso corregir el lint preexistente `react-hooks/purity` (Date.now en render)
- [x] 5.3 Biblioteca: sumar `deadline` al select existente y `<DeadlineBadge>` en la fila del ítem (sin queries nuevas)
- [x] 5.4 Detalle de ítem (`item/[id]/page.tsx`): traer `deadline`, mostrar badge en el encabezado/detalles
- [x] 5.5 Listado y detalle de proyectos: traer `deadline`, badge en `/proyectos` y en `/proyectos/[id]`

## 6. Verificación

- [x] 6.1 `npm run lint` — sin errores nuevos (y con el preexistente de dashboard corregido: 4 restantes o menos)
- [x] 6.2 `npm run build` — compila sin errores
- [x] 6.3 Verificación funcional con preview: asignar/quitar fecha en ítem, paso y proyecto; agenda en las tres vistas (conmutación + persistencia de preferencia); empty state; módulo del dashboard; badge vencido/hoy/pronto/lejano; nav móvil en 360/390px
- [x] 6.4 Verificar exclusiones: completar un paso/ítem y archivar un proyecto con fecha → desaparecen de la agenda; ítem `paused` permanece
