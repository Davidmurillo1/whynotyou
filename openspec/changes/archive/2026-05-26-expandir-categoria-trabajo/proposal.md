## Why

Hoy la app modela todo como "estudio": el lenguaje del producto, las stats ("días con estudio", "Sin sesiones todavía"), las unidades (páginas/videos/capítulos) y la propia descripción de ítem giran alrededor de aprender algo. Pero el flujo de fondo —cronometrar sesiones contra un objetivo dividido en unidades— sirve igual para trabajo. Faltan dos piezas para que la app también escale al trabajo: (1) separar los ítems entre estudio y trabajo para que las stats no mezclen ambos, y (2) poder descomponer un ítem en pasos con peso porcentual, porque un proyecto de trabajo rara vez se mide en "páginas" — se mide en hitos de tamaño distinto.

## What Changes

- Cada ítem suma un campo `scope` con valores `study` (estudio) o `work` (trabajo). Default `study` para preservar el comportamiento actual y para todos los ítems existentes.
- En el formulario de creación de ítem, el usuario elige el `scope` antes de cargar el resto. El `scope` aparece en la cabecera del detalle de ítem y como filtro en biblioteca.
- Nueva entidad `item_steps`: lista ordenada de pasos por ítem, cada uno con un nombre, un peso en porcentaje (`weight_pct`, entero 1–100) y un flag `is_done`. La suma de pesos de un ítem MUST cerrar 100 cuando hay al menos un paso.
- Cuando un ítem tiene pasos, el progreso del ítem se calcula como la suma de pesos de pasos completados, en vez de `current_units / total_units`. Cuando no tiene pasos, sigue funcionando exactamente como hoy (unidades).
- Las sesiones pueden referenciar un `step_id` opcional. Marcar un paso como `done` desde una sesión es atómico (se registra en la sesión y se actualiza el paso en la misma server action).
- La página `/stats` muestra el tiempo total y semanal **separado** entre estudio y trabajo. El heatmap anual se mantiene global pero con dos series superpuestas (o un toggle), y la sección "Por categoría" pasa a tener un filtro por scope.
- El dashboard "Hoy" agrupa los ítems activos por `scope` (primero los del scope que más se usó hoy, o uno arriba y otro abajo cuando hay de ambos).
- Copy del producto: cuando hay ítems de trabajo, los textos del greeting y de los empty states adaptan "lo que estás aprendiendo" → "en lo que estás trabajando" / "lo que estás haciendo" según el contexto.

## Capabilities

### New Capabilities
- `item-scope`: clasifica cada ítem entre estudio (`study`) y trabajo (`work`), expone el filtro en la biblioteca y guía el copy del dashboard.
- `item-steps`: permite descomponer un ítem en una lista ordenada de pasos con peso porcentual, calcula el progreso a partir de los pasos completados y deja registrar el avance del paso desde una sesión.
- `stats-by-scope`: el resumen de tiempo (totales, semanal, por categoría) se calcula y muestra distinguiendo estudio y trabajo.

### Modified Capabilities
<!-- Ninguna. El único spec principal existente es `root-not-found-page`, que no se toca. -->

## Impact

- **Base de datos (Supabase)**:
  - `items` suma columna `scope text not null default 'study' check (scope in ('study','work'))`.
  - Nueva tabla `item_steps` con `id`, `item_id`, `user_id`, `position int`, `name text`, `weight_pct int check 1..100`, `is_done bool`, `done_at timestamptz`, `created_at`. Índice en `(item_id, position)`. Constraint a nivel base o trigger para validar que la suma de `weight_pct` de un ítem cierre 100 cuando hay al menos un paso.
  - `sessions` suma columna `step_id uuid null references item_steps(id) on delete set null`.
  - RLS en `item_steps` análogo al de `items` (filtrado por `user_id`).
  - Vista o función `daily_minutes` (la que ya alimenta el heatmap) se extiende para devolver `minutes_study` y `minutes_work` además del total.
- **Server actions** (`src/lib/actions/`):
  - `items.ts`: aceptar `scope` en `createItemAction`; nueva acción `updateItemScopeAction`.
  - Nuevo `steps.ts`: `createStepAction`, `updateStepAction`, `reorderStepsAction`, `toggleStepAction`, `deleteStepAction`.
  - `sessions.ts`: aceptar `step_id` opcional y, si llega, actualizar el paso atómicamente.
- **Schemas Zod** (`src/lib/items/schemas.ts`, nuevo `src/lib/items/steps-schemas.ts`): incorporar `scope` en `createItemSchema` y crear schemas para pasos.
- **Constantes** (`src/lib/items/constants.ts`): nuevo `ITEM_SCOPE_OPTIONS` con labels en español (`Estudio`, `Trabajo`).
- **UI**:
  - `src/app/(app)/item/nuevo/item-form.tsx`: agregar selector de scope.
  - `src/app/(app)/item/[id]/page.tsx`: mostrar scope en cabecera, sección de pasos cuando aplica.
  - `src/app/(app)/item/[id]/sesion/`: si el ítem tiene pasos, ofrecer elegir contra cuál se está trabajando.
  - `src/app/(app)/biblioteca/`: filtro por scope.
  - `src/app/(app)/dashboard/page.tsx`: agrupar ítems activos por scope.
  - `src/app/(app)/stats/page.tsx`, `weekly-chart.tsx`, `yearly-heatmap.tsx`, `category-breakdown.tsx`: split por scope.
- **Sin impacto** en autenticación, recordatorios, perfil ni el flujo del proxy.
- **Compatibilidad**: ítems existentes quedan con `scope = 'study'` y sin pasos; la app sigue funcionando idéntico para ellos.
