## Why

Hoy en la pantalla de detalle del ítem el usuario tipea un número en la casilla "%" de cada módulo y la app lo trata como **peso relativo** — no como porcentaje absoluto. Eso produce una lectura confusa: cuatro módulos con valor `1` cada uno muestran "25% del peso total" sin que en ningún lado se sumen 100. La etiqueta visual (`%`) miente sobre lo que pasa en el cálculo.

Queremos que el usuario pueda decidir de forma explícita cómo se reparte el peso: o que todos los módulos pesen lo mismo (la app calcula la distribución), o que él fije porcentajes específicos que sumen 100. En el segundo caso, hay que evitar la trampa clásica de "no me deja guardar nada hasta que cierre 100" — el usuario tiene que poder crear módulos uno por uno sin que el sistema le bloquee cada inserción intermedia.

## What Changes

- Cada ítem con pasos tendrá un nuevo atributo `weight_mode` con dos valores: `'equal'` (default, los módulos pesan lo mismo) y `'custom'` (el usuario asigna pesos explícitos que deben sumar 100).
- En modo `'equal'`: la columna `weight_pct` de cada módulo se ignora para el cálculo; el progreso del ítem es `done_roots / total_roots`. La UI no muestra el input de peso por módulo y el header ya no dice "% del peso total".
- En modo `'custom'`: el input de peso por módulo aparece, sigue admitiendo decimales (`33.33`) y la UI muestra en vivo cuánto suman los pesos. **El bloqueo de guardado por suma ≠ 100 aplica solo al cierre del editor de módulos**, no a cada operación intermedia (crear, renombrar, mover, marcar) — éstas se aceptan siempre, aunque la suma esté abierta. Si al cerrar / al cambiar a `'custom'` la suma no es 100, la UI muestra un banner persistente "El progreso del ítem se está calculando con pesos que no suman 100" pero igual permite seguir trabajando.
- Cambiar de `'custom'` a `'equal'` preserva los `weight_pct` actuales en DB (no se borran) por si el usuario vuelve.
- Cuando un ítem **nuevo** entra al modelo de pasos, arranca en `'equal'` por default. Los ítems existentes con pasos quedan en `'custom'` para no romper la lectura que ya tenían sus usuarios.
- El mismo `weight_mode` se aplica al nivel de **tareas dentro de un módulo**, complementario al `progress_mode` ya existente (`weighted` / `count`). En la práctica `progress_mode = 'count'` cubre el caso "equal" para tareas — no se introduce un eje nuevo a ese nivel, sólo se documenta el solapamiento. **El `weight_mode` afecta únicamente al nivel raíz (módulos).**

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `item-steps`: agregar el atributo `weight_mode` al ítem, los nuevos requisitos sobre cómo se calcula el progreso bajo cada modo, y la regla de validación "suma 100 solo se exige al cierre del editor, no a cada operación intermedia".

## Impact

- **DB**: nueva columna `items.steps_weight_mode` (text, check `'equal' | 'custom'`, default `'equal'`). Migración en `supabase/migrations/`.
- **Schemas Zod**: `createItemSchema`, `updateItemSchema` (o el equivalente) aceptan el nuevo modo. Una nueva action `setStepsWeightModeAction` para alternar el modo en un ítem existente.
- **Cálculo de progreso**: `src/lib/items/progress.ts → computeItemProgress` ramifica por `weight_mode`. En `'equal'` ignora `weight_pct` de los roots y promedia por count; en `'custom'` mantiene la lógica actual.
- **UI**: `src/app/(app)/item/[id]/steps-editor.tsx` muestra un toggle "Peso: Igualitario / Personalizado", oculta los inputs de peso en `'equal'`, agrega indicador de suma en vivo y banner cuando ≠ 100 en `'custom'`.
- **Header del ítem**: la línea "X de Y módulos · Z% del peso total" muestra solo "X de Y módulos · Z%" en `'equal'` (sin "peso total"), y la versión con peso solo en `'custom'`.
- **No hay cambio en sesiones, stats ni heatmap** — el porcentaje final del ítem sigue siendo el único dato consumido por esas vistas.
