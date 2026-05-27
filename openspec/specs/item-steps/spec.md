# item-steps Specification

## Purpose

Permitir descomponer un ítem en una lista jerárquica de **pasos** con peso porcentual. Los pasos raíz se llaman **módulos** y pueden tener **tareas** hijas (un solo nivel de anidación). Cuando un ítem tiene pasos, el progreso se calcula a partir de ellos en lugar del modelo de unidades. Cada módulo puede elegir entre dos modos de cálculo (`weighted` o `count`) para decidir cómo se promedian sus tareas. Los pesos son **relativos**: no se exige que sumen 100. Las sesiones pueden referenciar un paso específico.

## Requirements

### Requirement: Pasos como descomposición de un ítem

Cada ítem SHALL poder tener cero o más pasos (`item_steps`) que descomponen el trabajo del ítem. Cada paso MUST tener: nombre, peso porcentual entero entre 1 y 100, posición en la lista, un flag `is_done` y opcionalmente un `parent_step_id` (referencia a otro paso del mismo ítem). Los pasos raíz (`parent_step_id = null`) se llaman **módulos**; los pasos con `parent_step_id` se llaman **tareas**.

#### Scenario: Crear un paso

- **WHEN** el usuario agrega un paso al ítem con nombre, peso y posición
- **THEN** el sistema crea la fila en `item_steps` asociada al `user_id` y al `item_id`
- **AND** el paso aparece en la lista ordenada de pasos del ítem

#### Scenario: Pasos opcionales

- **WHEN** un ítem se crea sin agregar pasos
- **THEN** el ítem persiste sin filas en `item_steps`
- **AND** el ítem funciona con el modelo de unidades existente

#### Scenario: Permisos por usuario

- **WHEN** una server action recibe un `step_id` o un `item_id` que no pertenece al `user_id` del JWT
- **THEN** la operación es rechazada por RLS y/o por el filtrado explícito en código
- **AND** ningún dato del otro usuario es leído ni modificado

### Requirement: Pesos relativos sin obligación de cerrar 100

Cada paso MUST tener un `weight_pct` numérico mayor que 0 y hasta 100 (admite decimales, ej. `33.33`). La suma de pesos **no** está obligada a cerrar ningún valor específico — los pesos se interpretan como **relativos**. El progreso del ítem se computa como `sum(weight_pct WHERE is_done) / sum(weight_pct)` (en modo `weighted`).

#### Scenario: Crear el primer paso con cualquier peso válido

- **WHEN** el usuario crea el primer paso de un ítem con un `weight_pct` cualquiera entre 1 y 100 (por ejemplo 50)
- **THEN** el paso se persiste sin error
- **AND** el ítem queda con sus pesos sumando 50, lo cual es válido

#### Scenario: Agregar más pasos incrementalmente

- **WHEN** el ítem ya tiene un paso con peso 50 y el usuario agrega un segundo paso con peso 30
- **THEN** ambos pasos coexisten
- **AND** la suma queda en 80, lo cual sigue siendo válido (no se exige cerrar 100)
- **AND** el progreso se calcula como `done_weight / 80`

#### Scenario: Editar el peso de un paso

- **WHEN** el usuario edita el `weight_pct` de un paso a cualquier entero entre 1 y 100
- **THEN** el cambio se persiste
- **AND** el progreso se recalcula con la nueva suma total

#### Scenario: Borrar un paso

- **WHEN** el usuario borra cualquier paso de un ítem
- **THEN** la operación se acepta sin importar la suma resultante
- **AND** el progreso se recalcula con los pasos restantes

#### Scenario: Borrar el último paso

- **WHEN** el usuario borra el único paso que tiene un ítem
- **THEN** la operación es aceptada (el ítem queda con cero pasos)
- **AND** el ítem vuelve a usar el modelo de unidades para su progreso

#### Scenario: Peso fuera de rango

- **WHEN** el usuario intenta crear o editar un paso con `weight_pct` ≤ 0 o > 100
- **THEN** la server action y el check de columna lo rechazan
- **AND** el paso no se persiste

#### Scenario: Peso con decimales

- **WHEN** el usuario crea o edita una tarea con peso `33.33`
- **THEN** el sistema lo persiste como `numeric(6,2)` con dos decimales de precisión
- **AND** las consultas posteriores devuelven el valor con sus decimales

### Requirement: Modo de cálculo del progreso del módulo (`progress_mode`)

Cada paso raíz (módulo) SHALL tener un atributo `progress_mode` con valores `'weighted'` (default) o `'count'`. El atributo determina cómo se calcula el progreso del módulo a partir de sus tareas hijas:
- `weighted`: `sum(child.weight_pct WHERE is_done) / sum(child.weight_pct)`.
- `count`: `done_children / total_children` (igualitario).

Para hojas y módulos sin hijos, `progress_mode` se ignora. El default es `weighted` por compatibilidad con el modelo previo.

#### Scenario: Módulo en modo `weighted` con tareas heterogéneas

- **WHEN** un módulo tiene tres tareas con pesos 50, 20 y 30 (suma 100), con sólo la de 50 completada, y `progress_mode = 'weighted'`
- **THEN** el progreso del módulo es 50%

#### Scenario: Módulo en modo `count` con las mismas tareas

- **WHEN** el mismo módulo tiene `progress_mode = 'count'` y solo 1 de 3 tareas completada
- **THEN** el progreso del módulo es 33% (1/3), independientemente de los `weight_pct` individuales

#### Scenario: Cambiar de `weighted` a `count` y volver

- **WHEN** el usuario alterna el `progress_mode` de un módulo
- **THEN** los `weight_pct` de las tareas se preservan en DB
- **AND** al volver a `weighted` el progreso se recalcula con los pesos originales

#### Scenario: Toggle solo visible en módulos con tareas

- **WHEN** un paso no tiene hijos (es una tarea o un módulo sin tareas)
- **THEN** la UI no muestra el toggle de modo
- **AND** cambiar `progress_mode` en DB para ese paso no afecta cálculo

### Requirement: Marcar un paso como completado

El usuario SHALL poder marcar y desmarcar un paso como completado (`is_done`). El sistema MUST registrar `done_at` cuando se marca, y limpiarlo cuando se desmarca.

#### Scenario: Marcar un paso

- **WHEN** el usuario marca un paso como completado
- **THEN** el sistema actualiza `is_done = true` y `done_at = now()` para ese paso
- **AND** el progreso del ítem se recalcula incluyendo el peso del paso

#### Scenario: Desmarcar un paso

- **WHEN** el usuario desmarca un paso que estaba completado
- **THEN** el sistema actualiza `is_done = false` y `done_at = null`
- **AND** el progreso del ítem se recalcula sin el peso del paso

### Requirement: Reordenar pasos

El usuario SHALL poder reordenar los pasos de un ítem sin que cambie su `weight_pct` ni su `is_done`.

#### Scenario: Reordenar dos pasos

- **WHEN** el usuario mueve un paso a otra posición en la lista
- **THEN** el sistema actualiza el campo `position` de los pasos afectados
- **AND** el orden visible reflja la nueva secuencia
- **AND** la suma de pesos sigue siendo 100

### Requirement: Progreso del ítem desde pasos cuando existen

Cuando un ítem tiene al menos un paso, el progreso porcentual mostrado del ítem SHALL ser `sum(weight_pct WHERE is_done) / sum(weight_pct)`. Cuando no tiene pasos, el progreso SHALL seguir siendo `current_units / total_units` como hoy.

#### Scenario: Ítem con pasos parcialmente completados (pesos cierran 100)

- **WHEN** un ítem tiene tres pasos con pesos 30 / 50 / 20 y solo el primero está completado
- **THEN** el `ProgressRing` del ítem muestra 30% (30 / 100)
- **AND** el listado de pasos marca el primero como completado y los otros dos como pendientes

#### Scenario: Ítem con pesos relativos que no cierran 100

- **WHEN** un ítem tiene dos pasos con pesos 30 / 50 (suma = 80) y solo el primero está completado
- **THEN** el `ProgressRing` del ítem muestra 37% (30 / 80, redondeado)
- **AND** la UI no indica error sobre los pesos

#### Scenario: Ítem con todos los pasos completados

- **WHEN** todos los pasos de un ítem están en `is_done = true`
- **THEN** el progreso del ítem es 100% (independientemente de la suma de pesos)
- **AND** el ítem queda elegible para marcarse como `status = 'done'`

#### Scenario: Ítem sin pasos — modelo anterior

- **WHEN** un ítem tiene cero pasos
- **THEN** el progreso se calcula como `current_units / total_units`
- **AND** las sesiones que aportan unidades siguen sumando a `current_units` igual que antes

### Requirement: Jerarquía de un solo nivel (módulos y tareas)

Un módulo (paso raíz) SHALL poder tener cero o más tareas hijas. Una tarea MUST NOT tener tareas hijas a su vez — la anidación está limitada a un solo nivel. La DB MUST rechazar cualquier intento de insertar o actualizar un paso con `parent_step_id` apuntando a un paso que ya tenga `parent_step_id` distinto de null.

#### Scenario: Agregar una tarea dentro de un módulo

- **WHEN** el usuario crea un paso pasando un `parent_step_id` que corresponde a un módulo del mismo ítem
- **THEN** el paso se persiste como tarea hija de ese módulo
- **AND** el módulo lista la tarea entre sus hijos

#### Scenario: Anidación rechazada

- **WHEN** el sistema intenta crear un paso con `parent_step_id` apuntando a una tarea (que ya tiene padre)
- **THEN** la operación es rechazada por el trigger DB con mensaje "Los pasos solo se anidan un nivel (módulo → tareas)."
- **AND** ningún registro se persiste

#### Scenario: Padre y tarea de ítems distintos

- **WHEN** el sistema intenta crear una tarea con `parent_step_id` apuntando a un paso de otro ítem
- **THEN** la operación es rechazada por el trigger DB
- **AND** ningún registro se persiste

#### Scenario: Borrar un módulo borra sus tareas

- **WHEN** el usuario borra un módulo que tiene tareas hijas
- **THEN** la cascada DB elimina también todas las tareas (`ON DELETE CASCADE` sobre `parent_step_id`)
- **AND** el ítem queda sin rastros del módulo ni de sus tareas

### Requirement: Estado y progreso derivado para módulos con tareas

Cuando un módulo tiene al menos una tarea hija, su `is_done` SHALL ser **derivado**: el módulo se considera completado cuando todas sus tareas están en `is_done = true`. El sistema MUST rechazar intentos de marcar manualmente el módulo como completado (toggle).

#### Scenario: Módulo con tareas, ninguna completada

- **WHEN** un módulo pesa 40, tiene 4 tareas iguales (peso 25 cada una) y ninguna está completada
- **THEN** el progreso del módulo es 0
- **AND** la contribución del módulo al progreso del ítem es 0

#### Scenario: Módulo con tareas, parcialmente completado

- **WHEN** un módulo pesa 40, tiene 4 tareas iguales (peso 25 cada una) y 2 están completadas
- **THEN** el progreso del módulo es 50%
- **AND** la contribución del módulo al progreso del ítem es `40 * 0.5 = 20` puntos ponderados

#### Scenario: Módulo con tareas, todas completadas

- **WHEN** todas las tareas hijas de un módulo están en `is_done = true`
- **THEN** el módulo aparece visualmente como completado (checkbox marcado, texto tachado)
- **AND** su contribución al progreso del ítem es su peso completo

#### Scenario: Intento de toggle manual sobre un módulo con tareas

- **WHEN** el usuario intenta marcar/desmarcar manualmente el checkbox de un módulo que tiene tareas
- **THEN** la UI muestra el checkbox deshabilitado
- **AND** si la server action recibe la operación igualmente, devuelve un error en español

### Requirement: Sesiones pueden referenciar un paso

Una sesión SHALL poder asociarse opcionalmente con un paso del ítem mediante `step_id`. Si la sesión completa el paso, marcar el paso como `done` es atómico con el registro de la sesión.

#### Scenario: Sesión sin paso

- **WHEN** el usuario registra una sesión y no elige ningún paso
- **THEN** la sesión se persiste con `step_id = null`
- **AND** el comportamiento es idéntico al anterior a esta capability

#### Scenario: Sesión que avanza un paso (lo deja pendiente)

- **WHEN** el usuario registra una sesión asociada a un paso pero no marca el paso como completo
- **THEN** la sesión se persiste con `step_id` apuntando al paso
- **AND** el paso sigue con `is_done = false`

#### Scenario: Sesión que completa un paso

- **WHEN** el usuario registra una sesión asociada a un paso y marca el paso como completado en la misma acción
- **THEN** en una sola server action (transacción) se persiste la sesión y el paso pasa a `is_done = true`, `done_at = now()`
- **AND** el progreso del ítem se recalcula incluyendo ese peso

#### Scenario: Borrar un paso referenciado por sesiones

- **WHEN** el usuario borra un paso que tiene sesiones asociadas
- **THEN** las sesiones se conservan pero su `step_id` queda en `null` (ON DELETE SET NULL)
- **AND** las stats por scope siguen siendo correctas (el scope es del ítem, no del paso)

### Requirement: UI para administrar pasos en el detalle del ítem

La página de detalle del ítem SHALL mostrar una sección de pasos cuando el ítem tiene al menos uno, y ofrecer una forma clara de agregarlos cuando no.

#### Scenario: Ítem sin pasos — call to action

- **WHEN** el usuario abre el detalle de un ítem que no tiene pasos
- **THEN** la página ofrece visiblemente la opción de "Agregar pasos" (sin imponerlo)
- **AND** el ítem sigue siendo usable solo con unidades

#### Scenario: Ítem con pasos — listado interactivo

- **WHEN** el usuario abre el detalle de un ítem con pasos
- **THEN** la página muestra los pasos en orden con su peso, estado (pendiente/completado) y controles para marcar, editar, reordenar y eliminar
- **AND** la UI indica claramente que el progreso se calcula desde pasos

#### Scenario: Confirmación al borrar todos los pasos

- **WHEN** el usuario intenta borrar el último paso de un ítem que tenía varios
- **THEN** la UI pide confirmación explícita advirtiendo que el progreso volverá a calcularse por unidades
- **AND** solo procede si el usuario confirma
