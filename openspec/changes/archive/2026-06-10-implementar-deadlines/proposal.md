# Proposal: implementar-deadlines

## Why

La app registra **qué** estás aprendiendo y **cuánto** avanzaste, pero no **para cuándo** tiene que estar listo. Sin fechas límite no hay forma de priorizar entre ítems en curso ni de detectar a tiempo que una certificación, un examen o una entrega de trabajo se viene encima. El usuario hoy administra esas fechas fuera de la app (cabeza, notas, calendario externo), perdiendo la conexión entre "cuánto me falta" y "cuánto tiempo me queda" — que es exactamente el dato que la app ya tiene para calcular.

## What Changes

- **Modelo de datos**: columna `deadline date` opcional (nullable) en `items`, `projects` e `item_steps` — cubre los cuatro niveles pedidos: proyectos, ítems, módulos y tareas (módulos y tareas son ambos `item_steps`).
- **Asignación de fecha límite** desde los flujos existentes: formulario de nuevo ítem, editor de detalles del ítem, editor de pasos (por módulo/tarea), formulario de nuevo proyecto y detalle del proyecto. Siempre opcional, siempre removible.
- **Nueva página `/agenda`**: una sección dedicada con **todos los deadlines pendientes** del usuario, legible en tres vistas conmutables:
  1. **Lista** — agrupada por urgencia (Vencidos / Hoy / Mañana / Esta semana / Este mes / Más adelante).
  2. **Calendario** — mensual, con indicadores por día y detalle del día seleccionado.
  3. **Línea de tiempo** — vista recomendada de alto nivel: barras de "pista de aterrizaje" desde hoy hasta cada deadline, cruzadas con el % de progreso actual de cada entidad; responde de un vistazo "¿qué se me viene encima y cuán atrasado estoy?".
- **Indicador de urgencia reutilizable** (`<DeadlineBadge>`): vencido (danger), vence hoy/pronto (warning, token de color nuevo), lejano (muted). Visible en la agenda, el dashboard, la biblioteca y los detalles de ítem/proyecto/pasos.
- **Dashboard**: módulo compacto "Vence pronto" con los próximos vencimientos y acceso directo a `/agenda`.
- **Navegación**: entrada "Agenda" en el header desktop y en la nav inferior móvil; la nav móvil pasa de solo-texto en `grid-cols-6` a **ícono + label** en 7 columnas (estilo tab bar de iOS) para alojar la séptima entrada sin desbordar.
- Sin breaking changes: columnas nullable, sin backfill, sin cambios en datos existentes.

## Capabilities

### New Capabilities

- `deadlines`: fechas límite opcionales en proyectos, ítems y pasos (módulos/tareas); asignación desde los flujos existentes; página `/agenda` con vistas Lista, Calendario y Línea de tiempo; indicadores de urgencia consistentes; módulo "Vence pronto" en el dashboard; exclusión automática de entidades completadas/archivadas.

### Modified Capabilities

- `projects`: el requirement "Navegación principal incluye Proyectos" cambia — la navegación pasa de 6 a 7 entradas (se agrega "Agenda" entre "Hoy" y "Biblioteca") y la nav inferior móvil pasa a `grid-cols-7` con ícono + label por entrada.

## Impact

- **DB (Supabase, proyecto `learning_tracking`)**: migración aditiva — `ALTER TABLE items/projects/item_steps ADD COLUMN deadline date`. RLS existente cubre las columnas nuevas; sin políticas nuevas.
- **Código nuevo**: `src/app/(app)/agenda/*` (página + 3 vistas), `src/components/deadline-badge.tsx`, `src/lib/deadlines/*` (helpers de urgencia, agrupado y fechas con timezone del perfil).
- **Código modificado**: `src/app/(app)/layout.tsx` (nav), `src/app/(app)/dashboard/page.tsx` (módulo "Vence pronto" — aprovecha y corrige el error de lint preexistente `react-hooks/purity`), `item/nuevo/item-form.tsx`, `item/[id]/item-details-editor.tsx`, `item/[id]/steps-editor.tsx` y `item/[id]/page.tsx`, `proyectos/nuevo/project-form.tsx`, `proyectos/[id]/page.tsx` + `project-actions.tsx`, `src/lib/actions/{items,steps,projects}.ts`, `src/lib/items/schemas.ts`, `src/lib/projects/schemas.ts`, `src/app/globals.css` (token `--color-warning`).
- **Dependencias**: ninguna nueva — `date-fns 4` (calendario/fechas) y `lucide-react` (íconos de nav) ya están instaladas.
- **Specs**: nueva `openspec/specs/deadlines/spec.md`; delta MODIFIED sobre `openspec/specs/projects/spec.md` (requirement de navegación).
