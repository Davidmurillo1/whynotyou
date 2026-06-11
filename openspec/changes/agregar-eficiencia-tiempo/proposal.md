# Proposal: Eficiencia de tiempo (estimado vs. real)

## Why

Hoy la app registra cuánto tiempo le dedicás a cada cosa, pero no tiene forma de responder la pregunta que más importa para mejorar: **¿estoy logrando mis objetivos en más o menos tiempo del que planifiqué?** Sin un tiempo estimado contra el cual comparar, las horas acumuladas son solo un número — no dicen si vas rápido, lento o en línea con lo que te propusiste.

Este change agrega una capa de **eficiencia**: estimaciones de tiempo opcionales en cada nivel (proyecto, ítem, módulo, tarea) y visualizaciones que comparan ese estimado contra el tiempo realmente invertido, tanto por entidad como a nivel global con filtro de fechas.

## What Changes

- **Estimación de tiempo opcional por entidad**: nueva columna `estimated_minutes` (nullable) en `items`, `item_steps` y `projects`, editable desde los formularios existentes (nuevo ítem, detalle del ítem, editor de pasos, nuevo proyecto, detalle del proyecto).
- **Estimación efectiva derivada**: si una entidad no tiene estimación propia, se deriva sumando las estimaciones de sus hijos (tareas → módulo → ítem → proyecto), señalada visualmente como derivada.
- **Índice de eficiencia**: métrica única `tiempo ganado / tiempo real` (modelo earned-value adaptado): para entidades completadas equivale a `estimado / real`; para entidades en curso, `progreso × estimado / tiempo invertido`. Clasificación en estados legibles ("Adelantado", "En línea", "Más lento", "Estimación superada").
- **Módulo de eficiencia en el detalle del ítem**: gráfica tipo bullet (tiempo real vs. marcador de estimado), índice, estado, y desglose por módulo cuando los pasos tienen estimaciones.
- **Módulo de eficiencia en el detalle del proyecto**: comparación agregada del proyecto + barras por ítem miembro.
- **Sección "Eficiencia" en `/stats`**: índice general del período, tiempo invertido vs. tiempo ganado, evolución temporal (gráfica de área acumulada con Recharts), desglose de ítems completados en el período, todo filtrable por rango de fechas (presets + rango custom vía search params).
- **Atribución de tiempo por paso**: el `duration_seconds` de una sesión se reparte en partes iguales entre los pasos asociados vía `session_steps`, para poder comparar real vs. estimado a nivel módulo/tarea.
- **Nuevo token de color `--color-success`** en `globals.css` para el estado "Adelantado" (análogo al `--color-warning` que introdujo deadlines).

No hay cambios breaking: todas las columnas nuevas son nullable, las entidades sin estimación se comportan exactamente igual que hoy y ninguna superficie existente cambia su semántica.

## Capabilities

### New Capabilities

- `eficiencia-tiempo`: estimación de tiempo opcional por proyecto/ítem/módulo/tarea, estimación efectiva derivada, índice de eficiencia con estados, atribución de tiempo por paso, módulos de eficiencia en detalle de ítem y proyecto, y sección de eficiencia general con rango de fechas en `/stats`.

### Modified Capabilities

_(ninguna — los requirements de las capabilities existentes no cambian; los formularios ganan un campo opcional y las páginas ganan secciones aditivas, todo cubierto por la capability nueva)_

## Impact

- **Base de datos (Supabase)**: migración aditiva — `estimated_minutes integer null check (> 0)` en `items`, `item_steps` y `projects`. Sin backfill (arranca en `null`). RLS existente cubre las columnas nuevas.
- **Schemas Zod**: `src/lib/items/schemas.ts`, `src/lib/items/steps-schemas.ts`, `src/lib/projects/schemas.ts` — campo opcional `estimated_minutes`.
- **Server Actions**: `src/lib/actions/items.ts`, `src/lib/actions/steps.ts`, `src/lib/actions/projects.ts` — persistir el campo nuevo + `revalidatePath` de las rutas afectadas.
- **Lógica nueva**: `src/lib/efficiency/` (cálculo de estimación efectiva, índice, estados, agregación por rango de fechas).
- **UI**:
  - `src/app/(app)/item/nuevo/item-form.tsx`, `src/app/(app)/item/[id]/item-details-editor.tsx`, `steps-editor.tsx`, `page.tsx` (módulo de eficiencia).
  - `src/app/(app)/proyectos/` — formulario y detalle (módulo de eficiencia).
  - `src/app/(app)/stats/page.tsx` + componentes nuevos (sección Eficiencia, selector de rango, gráfica Recharts).
  - `src/components/` — componente compartido de barra/bullet de eficiencia y chip de estado.
  - `src/app/globals.css` — token `--color-success`.
- **Dependencias**: ninguna nueva (Recharts 3, date-fns 4 y lucide-react ya están).
- **Queries**: lecturas one-shot adicionales (sesiones del rango con join a items, `session_steps` del ítem/proyecto) — sin N+1, siguiendo el patrón de stats y deadlines.
