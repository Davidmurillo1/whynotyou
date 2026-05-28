## MODIFIED Requirements

### Requirement: Sesiones pueden referenciar un paso

Una sesión SHALL poder asociarse opcionalmente con **uno o varios pasos** del ítem mediante la tabla puente `session_steps`. Cada asociación MUST registrar si el paso fue completado dentro de la sesión (`completed_in_session = true`). Si una sesión completa uno o más pasos, marcar esos pasos como `is_done = true` MUST ocurrir en la misma transacción que el registro de la sesión. La tabla `session_steps` MUST respetar RLS por `user_id` y cascadear sus filas cuando se borre la sesión madre o el paso referenciado.

Se preserva la columna `sessions.step_id` por compatibilidad con sesiones históricas (no se elimina en este change), pero las **escrituras** desde la server action `createSessionAction` MUST escribir exclusivamente en `session_steps` y dejar `sessions.step_id` en `null` para todas las sesiones nuevas.

#### Scenario: Sesión sin paso

- **WHEN** el usuario registra una sesión y no selecciona ningún paso
- **THEN** la sesión se persiste sin filas asociadas en `session_steps`
- **AND** el comportamiento es idéntico al de una sesión que antes tenía `step_id = null`

#### Scenario: Sesión que avanza un paso (lo deja pendiente)

- **WHEN** el usuario registra una sesión, selecciona un paso y NO marca "Terminé"
- **THEN** se crea una fila en `session_steps` con `completed_in_session = false`
- **AND** el paso sigue con `is_done = false`
- **AND** las stats por paso (si existen) imputan el `duration_seconds` de la sesión a ese paso

#### Scenario: Sesión que completa un paso

- **WHEN** el usuario registra una sesión, selecciona un paso y marca "Terminé"
- **THEN** en una sola transacción se crea la sesión, se inserta `session_steps(session_id, step_id, completed_in_session = true)` y el paso pasa a `is_done = true, done_at = now()`
- **AND** el progreso del ítem se recalcula incluyendo ese paso

#### Scenario: Sesión asociada a múltiples pasos, algunos completados

- **WHEN** el usuario registra una sesión y selecciona tres tareas, marcando "Terminé" en dos de ellas
- **THEN** la sesión se persiste con UNA fila en `sessions` (duración X)
- **AND** se insertan tres filas en `session_steps`: dos con `completed_in_session = true` y una con `false`
- **AND** las dos tareas marcadas como terminadas pasan a `is_done = true, done_at = now()`
- **AND** la suma de `duration_seconds` en stats globales sigue contando como X (no como 3·X)

#### Scenario: Selección incluye un módulo con tareas hijas marcado "Terminé"

- **WHEN** el usuario selecciona un módulo que tiene tareas hijas y la UI permitió marcar "Terminé" (estado inconsistente)
- **THEN** la asociación en `session_steps` se crea con `completed_in_session = true`
- **AND** el `is_done` del módulo NO se modifica (sigue siendo derivado de sus tareas)
- **AND** la operación no se rechaza; la inconsistencia se ignora silenciosamente como defensa en profundidad

#### Scenario: Borrar un paso referenciado por sesiones

- **WHEN** el usuario borra un paso que tiene filas en `session_steps`
- **THEN** las filas en `session_steps` se eliminan por cascada
- **AND** las sesiones madre (filas en `sessions`) se conservan con todos sus campos intactos
- **AND** el tiempo total acumulado por scope/ítem no cambia

#### Scenario: Borrar una sesión asociada a pasos

- **WHEN** se borra una fila de `sessions`
- **THEN** todas sus filas en `session_steps` se eliminan por cascada
- **AND** los pasos referenciados conservan su estado `is_done` actual (no se desmarcan automáticamente)

#### Scenario: Migración de sesiones históricas

- **WHEN** la migración corre sobre la base existente
- **THEN** para cada fila de `sessions` con `step_id IS NOT NULL` se inserta una fila en `session_steps(session_id, step_id, user_id, completed_in_session = false)`
- **AND** `sessions.step_id` se preserva en DB (no se borra)
- **AND** ninguna sesión histórica se modifica más allá de la asociación nueva

#### Scenario: Sesión con array de pasos vacío

- **WHEN** el cliente envía `steps: []` o `steps: undefined`
- **THEN** la sesión se persiste sin filas en `session_steps`
- **AND** el comportamiento es equivalente a "Sesión sin paso"

## ADDED Requirements

### Requirement: UI de selección múltiple de pasos al cerrar la sesión

La pantalla "Sesión terminada" (fase `capture` del cronómetro) SHALL ofrecer una lista de pasos del ítem que permita seleccionar **N pasos** y, por cada uno seleccionado, indicar si se terminó dentro de esa sesión. La lista MUST mantener el agrupamiento actual en "Pendientes" y "Ya completados" e incluir todos los pasos del ítem (módulos y tareas) en su orden por `position`. Para cada paso seleccionado, la UI MUST mostrar feedback visual inmediato cuando el usuario marca "Terminé" (tachado del nombre y opacidad reducida).

#### Scenario: Render inicial sin selección

- **WHEN** el usuario llega a la fase `capture` después del cronómetro
- **THEN** la lista de pasos aparece con todos los checkboxes principales sin marcar
- **AND** ningún checkbox "Terminé" está visible (porque depende de la selección)
- **AND** el botón "Guardar sesión" sigue habilitado (la selección es opcional)

#### Scenario: Seleccionar un paso pendiente revela el checkbox "Terminé"

- **WHEN** el usuario marca el checkbox principal de una tarea pendiente
- **THEN** al lado del nombre aparece un checkbox secundario "Terminé"
- **AND** el checkbox "Terminé" arranca sin marcar
- **AND** el nombre del paso se renderiza sin tachado

#### Scenario: Marcar "Terminé" tacha el nombre en vivo

- **WHEN** el usuario marca el checkbox "Terminé" de una tarea seleccionada
- **THEN** el nombre del paso aparece con `line-through` y opacidad reducida en la misma pantalla, antes de guardar
- **AND** desmarcar "Terminé" remueve el tachado

#### Scenario: Módulo con tareas hijas — "Terminé" deshabilitado

- **WHEN** el usuario selecciona un módulo que tiene al menos una tarea hija
- **THEN** el checkbox "Terminé" aparece deshabilitado (gris, no clickeable)
- **AND** un texto auxiliar indica "Se completa cuando termines todas sus tareas"
- **AND** el paso igualmente se asocia a la sesión vía `session_steps` con `completed_in_session = false`

#### Scenario: Paso ya completado — "Terminé" oculto

- **WHEN** el usuario selecciona un paso del grupo "Ya completados"
- **THEN** el checkbox "Terminé" no se renderiza (ya está hecho)
- **AND** el paso se asocia a la sesión con `completed_in_session = false`
- **AND** el nombre del paso conserva su estilo de ya completado (sin agregar tachado adicional)

#### Scenario: Submit con selección múltiple

- **WHEN** el usuario tiene tres tareas seleccionadas (dos con "Terminé" marcado) y presiona "Guardar sesión"
- **THEN** la server action recibe `steps: [{step_id, complete: true}, {step_id, complete: true}, {step_id, complete: false}]`
- **AND** la sesión se persiste con esas tres asociaciones
- **AND** las dos tareas con `complete = true` quedan `is_done = true`

#### Scenario: Submit sin selección

- **WHEN** el usuario no selecciona ningún paso y presiona "Guardar sesión"
- **THEN** la server action recibe `steps: []` (o ausente)
- **AND** la sesión se persiste sin filas en `session_steps`
- **AND** el flujo de "itemCompleted" sigue funcionando como hoy (puede completarse el ítem por unidades si las hubiera)

#### Scenario: Ítem sin pasos — UI sigue como antes

- **WHEN** el usuario termina la sesión de un ítem que no tiene pasos
- **THEN** la fase `capture` NO muestra la lista de pasos
- **AND** se renderiza el input "Avancé hasta (unidad)" como hoy
- **AND** el flujo de submit ignora cualquier referencia a `steps`

### Requirement: Tabla puente `session_steps` con integridad y RLS

El sistema SHALL persistir las asociaciones N:N entre sesiones y pasos en una tabla `session_steps` con clave primaria compuesta `(session_id, step_id)`. La tabla MUST tener RLS habilitada, políticas `select`/`insert`/`delete` filtradas por `auth.uid() = user_id`, FK `session_id` con `ON DELETE CASCADE` y FK `step_id` con `ON DELETE CASCADE`. La tabla MUST denormalizar el `user_id` para que RLS no necesite joins.

#### Scenario: Inserción con `user_id` ajeno

- **WHEN** un cliente intenta insertar una fila en `session_steps` con un `user_id` distinto al del JWT
- **THEN** la política RLS rechaza el insert
- **AND** ninguna fila se persiste

#### Scenario: Inserción con `session_id` ajeno

- **WHEN** un cliente intenta insertar una fila apuntando a una sesión de otro usuario (aunque el `user_id` coincida con el suyo)
- **THEN** la operación se rechaza vía RLS (el join lógico falla) o vía validación explícita en la RPC
- **AND** ninguna fila se persiste

#### Scenario: Duplicado por PK compuesta

- **WHEN** un cliente intenta insertar dos veces la misma combinación `(session_id, step_id)`
- **THEN** el segundo insert es rechazado por violación de PK
- **AND** queda exactamente una fila

#### Scenario: Cascada al borrar la sesión

- **WHEN** se borra la fila madre en `sessions`
- **THEN** Postgres elimina automáticamente todas las filas correspondientes en `session_steps`
- **AND** los pasos referenciados no se modifican

#### Scenario: Cascada al borrar el paso

- **WHEN** se borra un paso de `item_steps`
- **THEN** Postgres elimina todas las filas en `session_steps` que apuntaban a ese paso
- **AND** las sesiones madre se preservan intactas
