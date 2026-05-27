## ADDED Requirements

### Requirement: Modo de asignación de peso entre módulos (`weight_mode`)

Cada ítem con pasos SHALL tener un atributo `weight_mode` (persistido en `items.steps_weight_mode`) con dos valores posibles:

- `'equal'` (default para ítems nuevos): todos los módulos pesan lo mismo. El sistema MUST ignorar `weight_pct` de cada módulo raíz al calcular el progreso y MUST tratar al ítem como si cada módulo aportara `1 / total_modules`. La columna `weight_pct` MUST preservarse en DB (no se resetea).
- `'custom'`: cada módulo aporta según su `weight_pct`. La suma de pesos de los módulos raíz **debería** ser 100, pero el sistema MUST aceptar estados intermedios donde la suma sea distinta (mayor o menor) para no bloquear ediciones incrementales.

El atributo `weight_mode` MUST poder cambiarse en cualquier momento sin destruir información: pasar de `'custom'` a `'equal'` no borra los `weight_pct`; pasar de `'equal'` a `'custom'` reusa los `weight_pct` ya guardados.

`weight_mode` SHALL aplicar únicamente al nivel raíz (módulos del ítem). Para tareas dentro de un módulo, el reparto sigue gobernado por el `progress_mode` existente del módulo (`'weighted'` o `'count'`).

#### Scenario: Ítem nuevo arranca en modo `equal`

- **WHEN** un usuario crea un ítem con pasos por primera vez
- **THEN** el ítem se persiste con `steps_weight_mode = 'equal'`
- **AND** el progreso del ítem se calcula como `done_modules / total_modules` independientemente de los `weight_pct`

#### Scenario: Cambiar a modo `custom` mantiene los pesos

- **WHEN** un ítem en modo `'equal'` con tres módulos (cada uno con `weight_pct = 1` por valor histórico) pasa a modo `'custom'`
- **THEN** el ítem queda en `steps_weight_mode = 'custom'`
- **AND** los `weight_pct` actuales (1, 1, 1) se siguen usando para el cálculo
- **AND** el progreso ahora se computa como `sum(weight_pct WHERE module_done) / sum(weight_pct)` (suma 3, lo cual la UI marca como "no cierra 100" pero igual computa)

#### Scenario: Cambiar a modo `equal` ignora pero conserva los pesos

- **WHEN** un ítem en modo `'custom'` con módulos de pesos 30 / 50 / 20 pasa a modo `'equal'`
- **THEN** el ítem queda en `steps_weight_mode = 'equal'`
- **AND** los `weight_pct` 30, 50, 20 persisten en DB sin cambios
- **AND** el progreso se recalcula como `done_modules / total_modules` ignorando esos pesos

#### Scenario: `weight_mode` solo afecta el nivel de módulos

- **WHEN** un módulo en modo `progress_mode = 'weighted'` tiene tareas con pesos distintos, en un ítem con `steps_weight_mode = 'equal'`
- **THEN** el progreso interno del módulo sigue calculándose por la suma ponderada de sus tareas (el `weight_mode` del ítem no aplica a este nivel)
- **AND** la contribución del módulo al ítem es `(1 / total_modules) * module_progress` (porque el ítem está en `equal`)

#### Scenario: Migración de ítems existentes

- **WHEN** la migración corre sobre ítems que ya tenían pasos antes de este cambio
- **THEN** esos ítems quedan en `steps_weight_mode = 'custom'` para preservar el cálculo que sus usuarios venían viendo
- **AND** solo los ítems nuevos arrancan en `'equal'`

### Requirement: Validación de suma 100 solo al cierre, no a cada operación

En modo `'custom'`, el sistema MUST aceptar TODAS las operaciones individuales sobre módulos (crear, renombrar, editar peso, mover, marcar completado, borrar) sin importar la suma actual de los `weight_pct`. La regla "suma = 100" SHALL ser una **señal visual continua** (no un bloqueo de la operación). El único punto donde la regla puede bloquear es:

- Una acción explícita "Normalizar a 100" iniciada por el usuario (opcional, no obligatoria).
- El paso de modo `'equal'` → `'custom'` no se bloquea aunque la suma actual ≠ 100.

El sistema MUST NOT mostrar errores de tipo "no se puede guardar este módulo porque la suma no es 100" durante operaciones individuales.

#### Scenario: Crear un módulo con peso 60 cuando ya hay uno con peso 50

- **WHEN** el ítem está en modo `'custom'` con un módulo de peso 50 y el usuario crea otro módulo con peso 60
- **THEN** el segundo módulo se persiste sin error
- **AND** la suma queda en 110, lo cual es válido como estado intermedio
- **AND** la UI muestra una indicación visual ("Suma: 110, debería ser 100") pero permite seguir trabajando

#### Scenario: Editar el peso de un módulo a un valor que aleja la suma de 100

- **WHEN** la suma actual de módulos es 100 y el usuario cambia el peso de un módulo de 30 a 70
- **THEN** la edición se acepta
- **AND** la suma pasa a 140 y la UI lo señala visualmente

#### Scenario: Borrar un módulo que deja la suma debajo de 100

- **WHEN** un ítem tiene tres módulos (30 / 40 / 30, suma 100) y el usuario borra el de 40
- **THEN** la operación procede sin pedir corregir la suma
- **AND** quedan dos módulos sumando 60 y el indicador visual lo marca
- **AND** el progreso se calcula como `done_weight / 60`

#### Scenario: Acción opcional "Normalizar a 100" entrega enteros

- **WHEN** el usuario invoca la acción "Normalizar a 100" sobre un ítem en modo `'custom'` con módulos cuyos pesos suman cualquier valor distinto de 100 (ej. 40 / 19.84 / 19.84 / 19.84 = 99.52)
- **THEN** el sistema reescala los pesos usando el **método del residuo mayor** (Hamilton) sobre porcentajes enteros
- **AND** el resultado entrega "números cerrados" (en el ejemplo: 40 / 20 / 20 / 20)
- **AND** la suma final es exactamente 100
- **AND** ningún módulo queda con peso menor que 1
- **AND** la UI refleja los nuevos pesos al instante, sin requerir refresco de página
- **AND** la operación es reversible solo por edición manual (no hay deshacer dedicado)

#### Scenario: Normalizar cuando todos los módulos están en 0

- **WHEN** el usuario invoca "Normalizar a 100" sobre un ítem con cuatro módulos en peso 0 (estado raro pero posible si el usuario editó manualmente)
- **THEN** el sistema asigna reparto igualitario en enteros (25 / 25 / 25 / 25)
- **AND** si el reparto exacto no es entero, el residuo de `100 % n` se asigna a los primeros módulos por posición (ej. 3 módulos → 34 / 33 / 33)

## MODIFIED Requirements

### Requirement: Pesos relativos sin obligación de cerrar 100

Cada paso MUST tener un `weight_pct` numérico mayor que 0 y hasta 100 (admite decimales, ej. `33.33`). La suma de pesos **no** está obligada a cerrar ningún valor específico — los pesos se interpretan según el `weight_mode` del ítem (ver requisito "Modo de asignación de peso entre módulos"). El sistema MUST persistir el `weight_pct` aunque el modo activo lo ignore (caso `'equal'`).

En modo `'custom'`, el progreso del ítem se computa como `sum(weight_pct WHERE module_done) / sum(weight_pct)`; en modo `'equal'`, se computa como `done_modules / total_modules`.

#### Scenario: Crear el primer paso con cualquier peso válido

- **WHEN** el usuario crea el primer paso de un ítem con un `weight_pct` cualquiera entre 0.01 y 100 (por ejemplo 50)
- **THEN** el paso se persiste sin error
- **AND** el ítem queda con sus pesos sumando 50, lo cual es válido como estado intermedio

#### Scenario: Agregar más pasos incrementalmente

- **WHEN** un ítem en modo `'custom'` ya tiene un paso con peso 50 y el usuario agrega un segundo paso con peso 30
- **THEN** ambos pasos coexisten
- **AND** la suma queda en 80, lo cual sigue siendo válido (no se exige cerrar 100 para guardar)
- **AND** el progreso se calcula como `done_weight / 80`

#### Scenario: Editar el peso de un paso

- **WHEN** el usuario edita el `weight_pct` de un paso a cualquier valor entre 0.01 y 100
- **THEN** el cambio se persiste
- **AND** el progreso se recalcula con la nueva suma total (si el ítem está en `'custom'`) o se ignora (si está en `'equal'`)

#### Scenario: Borrar un paso

- **WHEN** el usuario borra cualquier paso de un ítem
- **THEN** la operación se acepta sin importar la suma resultante
- **AND** el progreso se recalcula con los pasos restantes según el `weight_mode` activo

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

#### Scenario: Pesos preservados al cambiar de modo

- **WHEN** el usuario alterna `weight_mode` entre `'custom'` y `'equal'` ida y vuelta
- **THEN** los `weight_pct` de los módulos no se modifican en DB
- **AND** al volver a `'custom'` el progreso se recalcula con los pesos originales

### Requirement: Progreso del ítem desde pasos cuando existen

Cuando un ítem tiene al menos un paso, el progreso porcentual mostrado del ítem SHALL calcularse según el `weight_mode` del ítem:

- `weight_mode = 'custom'`: `sum(root.weight_pct * computeStepProgress(root)) / sum(root.weight_pct)`.
- `weight_mode = 'equal'`: `sum(computeStepProgress(root)) / total_roots` (todos los módulos pesan lo mismo, sus `weight_pct` se ignoran).

Cuando el ítem no tiene pasos, el progreso SHALL seguir siendo `current_units / total_units` como hoy.

#### Scenario: Ítem en modo `equal` con módulos heterogéneos

- **WHEN** un ítem en `'equal'` tiene cuatro módulos donde solo el primero está completado (independientemente de que sus `weight_pct` históricos sean 1 / 1 / 1 / 1 ó 30 / 50 / 10 / 10)
- **THEN** el `ProgressRing` del ítem muestra 25% (1 de 4 módulos)
- **AND** la UI no muestra "% del peso total" porque el peso no se está usando

#### Scenario: Ítem en modo `custom` con pesos parcialmente completados (pesos cierran 100)

- **WHEN** un ítem en `'custom'` tiene tres pasos con pesos 30 / 50 / 20 y solo el primero está completado
- **THEN** el `ProgressRing` del ítem muestra 30% (30 / 100)
- **AND** el listado de pasos marca el primero como completado y los otros dos como pendientes

#### Scenario: Ítem en modo `custom` con pesos relativos que no cierran 100

- **WHEN** un ítem en `'custom'` tiene dos pasos con pesos 30 / 50 (suma = 80) y solo el primero está completado
- **THEN** el `ProgressRing` del ítem muestra 37% (30 / 80, redondeado)
- **AND** la UI muestra el banner "La suma de pesos no es 100" pero no bloquea ninguna operación

#### Scenario: Ítem con todos los pasos completados

- **WHEN** todos los pasos de un ítem están completados (sea por toggle directo o por toggle de todas sus tareas)
- **THEN** el progreso del ítem es 100% (independientemente del `weight_mode` y de la suma de pesos)
- **AND** el ítem queda elegible para marcarse como `status = 'done'`

#### Scenario: Ítem sin pasos — modelo anterior

- **WHEN** un ítem tiene cero pasos
- **THEN** el progreso se calcula como `current_units / total_units`
- **AND** las sesiones que aportan unidades siguen sumando a `current_units` igual que antes

### Requirement: UI para administrar pasos en el detalle del ítem

La página de detalle del ítem SHALL mostrar una sección de pasos cuando el ítem tiene al menos uno, y ofrecer una forma clara de agregarlos cuando no. La sección MUST incluir un control para alternar `weight_mode` cuando el ítem tiene módulos, y MUST reflejar visualmente la coherencia de la suma cuando está en `'custom'`.

#### Scenario: Ítem sin pasos — call to action

- **WHEN** el usuario abre el detalle de un ítem que no tiene pasos
- **THEN** la página ofrece visiblemente la opción de "Agregar pasos" (sin imponerlo)
- **AND** el ítem sigue siendo usable solo con unidades

#### Scenario: Ítem con pasos — listado interactivo

- **WHEN** el usuario abre el detalle de un ítem con pasos
- **THEN** la página muestra los pasos en orden con su nombre, estado (pendiente/completado) y controles para marcar, editar, reordenar y eliminar
- **AND** la UI indica claramente que el progreso se calcula desde pasos
- **AND** se muestra el toggle "Peso: Igualitario / Personalizado" sobre la lista de módulos

#### Scenario: Modo `equal` — sin inputs de peso por módulo

- **WHEN** un ítem con módulos está en `weight_mode = 'equal'`
- **THEN** los inputs numéricos "%" por módulo MUST NOT renderizarse
- **AND** el subtítulo de la sección muestra "X de Y módulos completados · Z%" (sin "del peso total")
- **AND** el toggle "Igualitario / Personalizado" muestra "Igualitario" como activo

#### Scenario: Modo `custom` — inputs visibles y suma en vivo

- **WHEN** un ítem está en `weight_mode = 'custom'`
- **THEN** cada módulo muestra su input de peso editable
- **AND** la sección muestra el total acumulado (ej.: "Suma actual: 87 / 100")
- **AND** si la suma ≠ 100, el indicador aparece en color de advertencia pero NO bloquea ninguna operación
- **AND** el subtítulo muestra "X de Y módulos completados · Z% del peso total"

#### Scenario: Confirmación al borrar todos los pasos

- **WHEN** el usuario intenta borrar el último paso de un ítem que tenía varios
- **THEN** la UI pide confirmación explícita advirtiendo que el progreso volverá a calcularse por unidades
- **AND** solo procede si el usuario confirma

#### Scenario: Cambiar de modo desde el toggle

- **WHEN** el usuario hace clic en el toggle para pasar de `'equal'` a `'custom'` (o viceversa)
- **THEN** el sistema invoca la server action `setStepsWeightModeAction`
- **AND** la persistencia ocurre sin pedir ningún input adicional
- **AND** la UI se rerenderiza con/sin los inputs de peso según el nuevo modo

#### Scenario: Acción "Normalizar a 100" disponible solo en `custom`

- **WHEN** el usuario está viendo un ítem en `'custom'` con suma ≠ 100
- **THEN** la UI ofrece un botón secundario "Normalizar a 100"
- **AND** el botón está oculto cuando el modo es `'equal'` (no aplica)
- **AND** al invocarlo, los pesos se reescalan proporcionalmente como se describe en el requisito de validación
