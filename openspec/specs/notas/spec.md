# notas Specification

## Purpose
TBD - created by archiving change add-notas. Update Purpose after archive.
## Requirements
### Requirement: Modelo de notas discretas por ítem y paso

El sistema SHALL permitir asociar cero, una o varias notas discretas a un ítem, a un módulo o a una tarea, persistidas como filas de la tabla `item_notes`. Cada nota MUST tener un `body` de texto (entre 1 y 4000 caracteres), un `item_id` **no nulo** y un `step_id` **nullable**: `step_id = null` identifica una nota del ítem; un `step_id` seteado identifica una nota de un módulo o una tarea (ambos son filas de `item_steps`). Toda operación MUST filtrar por `user_id` (además de RLS). Las notas de un elemento MUST eliminarse en cascada cuando se borra el ítem, el módulo o la tarea al que pertenecen.

#### Scenario: Agregar una nota a un ítem

- **WHEN** el usuario agrega una nota con texto a un ítem propio
- **THEN** el sistema persiste una fila en `item_notes` con `item_id` del ítem, `step_id = null` y el `body` ingresado, filtrando por `user_id`
- **AND** la nota queda visible en el panel de notas del ítem

#### Scenario: Agregar una nota a un módulo o tarea

- **WHEN** el usuario agrega una nota a un módulo o a una tarea propios
- **THEN** el sistema deriva el `item_id` a partir del paso (autoritativo, no del cliente) y persiste la nota con ese `item_id` y el `step_id` del paso
- **AND** la nota queda asociada a ese paso y no aparece en otros

#### Scenario: Varias notas en un mismo elemento

- **WHEN** el usuario agrega una segunda nota al mismo elemento
- **THEN** ambas notas coexisten como filas independientes con su propio `created_at`
- **AND** el panel las lista en orden cronológico ascendente

#### Scenario: Nota vacía rechazada

- **WHEN** una server action recibe un `body` vacío o compuesto solo por espacios
- **THEN** la validación Zod (`trim().min(1)`) lo rechaza con un mensaje en español y el `CHECK` de la base actúa como defensa en profundidad
- **AND** ninguna nota se persiste

#### Scenario: Cascada al borrar el elemento

- **WHEN** el usuario borra un ítem, un módulo o una tarea que tiene notas
- **THEN** las notas de ese elemento se eliminan en cascada
- **AND** al borrar un módulo, las notas de sus tareas hijas también se eliminan (vía `item_steps.parent_step_id ON DELETE CASCADE`)

#### Scenario: Aislamiento entre usuarios

- **WHEN** el usuario A intenta crear o borrar una nota sobre un elemento del usuario B
- **THEN** la RLS, el filtrado por `user_id` y el trigger de ownership rechazan la operación
- **AND** ninguna nota del usuario B se ve afectada

#### Scenario: Coherencia ítem–paso

- **WHEN** una nota de paso llega con un `item_id` que no coincide con el `item_id` real del paso
- **THEN** el trigger `check_item_note_ownership` rechaza la operación
- **AND** ninguna nota se persiste

### Requirement: Ícono indicador de notas

El sistema SHALL mostrar un ícono de notas en el header del ítem, en la fila de cada módulo y en la fila de cada tarea del detalle del ítem. El ícono MUST tener dos estados: **apagado** (atenuado) cuando el elemento no tiene notas, y **con notas** (destacado con el color de acento y un contador numérico) cuando tiene una o más. El ícono MUST ser visible aun cuando el elemento no tenga notas, para que la acción sea descubrible. El diseño MUST usar los tokens de color del proyecto, sin colores Tailwind crudos.

#### Scenario: Elemento sin notas

- **WHEN** un ítem, módulo o tarea no tiene notas
- **THEN** su ícono se muestra en estado apagado (atenuado), sin contador

#### Scenario: Elemento con notas

- **WHEN** un elemento tiene N notas (N ≥ 1)
- **THEN** su ícono se muestra destacado con el contador `N`

#### Scenario: El contador refleja los cambios al instante

- **WHEN** el usuario agrega o borra una nota
- **THEN** el contador del ícono se actualiza de inmediato sin recargar la página (estado controlled en el cliente)

### Requirement: Panel de notas inline

El sistema SHALL abrir, al activar el ícono, un panel desplegable inline (no un modal ni un popover) ubicado debajo del elemento. El panel MUST listar las notas existentes como texto plano —respetando saltos de línea, sin auto-linkificar— cada una con su fecha y un control para quitarla, y MUST ofrecer un campo para escribir y agregar una nueva nota. El panel MUST poder abrirse sin realizar una consulta adicional (las notas ya vienen cargadas con el detalle del ítem).

#### Scenario: Abrir el panel de un elemento con notas

- **WHEN** el usuario activa el ícono de un elemento que tiene notas
- **THEN** el panel se despliega debajo mostrando cada nota con su fecha y su control para quitar
- **AND** no se dispara ninguna consulta adicional al abrir

#### Scenario: Abrir el panel de un elemento sin notas

- **WHEN** el usuario activa el ícono de un elemento sin notas
- **THEN** el panel se despliega mostrando un estado vacío y el campo para escribir la primera nota

#### Scenario: Layout estable en viewport angosto

- **WHEN** el panel se abre en un viewport de 360px de ancho
- **THEN** el panel ocupa el ancho disponible sin desbordar horizontalmente
- **AND** los controles de la fila no se rompen (se permite `flex-wrap` en el cluster de controles)

### Requirement: Crear una nota

El sistema SHALL exponer una server action que valide el input con Zod, verifique la sesión, derive el `item_id` a partir del `step_id` cuando corresponda, persista la nota filtrando por `user_id` y revalide la ruta del detalle del ítem. Al confirmarse la creación, la nota MUST agregarse al estado del cliente con su identificador real (append-on-success).

#### Scenario: Crear una nota exitosamente

- **WHEN** el usuario escribe una nota y confirma
- **THEN** la server action persiste la nota, revalida `/item/[id]` y devuelve la nota creada
- **AND** el cliente la agrega al panel y actualiza el contador del ícono

#### Scenario: Fallo de creación

- **WHEN** la server action devuelve un error
- **THEN** el cliente muestra el mensaje en español y no agrega ninguna nota al panel

### Requirement: Editar una nota

El sistema SHALL permitir editar el cuerpo de una nota existente desde el panel inline y desde la vista centralizada. La edición MUST validar el nuevo cuerpo con las mismas reglas que la creación (no vacío, hasta 4000 caracteres), persistirlo filtrando por `user_id`, actualizar `updated_at` y revalidar la ruta del detalle del ítem. Al confirmarse, la nota MUST reflejar el nuevo texto de inmediato en el estado del cliente.

#### Scenario: Editar el texto de una nota

- **WHEN** el usuario edita una nota y guarda un texto distinto y válido
- **THEN** la server action persiste el nuevo `body`, actualiza `updated_at` y revalida `/item/[id]`
- **AND** el cliente reemplaza la nota por la versión actualizada sin recargar

#### Scenario: Cancelar la edición

- **WHEN** el usuario abre la edición de una nota pero cancela
- **THEN** la nota conserva su texto original y nada se persiste

#### Scenario: Edición inválida rechazada

- **WHEN** el usuario intenta guardar una nota con el cuerpo vacío o solo espacios
- **THEN** la validación Zod (`trim().min(1)`) lo rechaza con un mensaje en español
- **AND** el texto original de la nota se mantiene

### Requirement: Borrar una nota

El sistema SHALL exponer una server action para borrar una nota, filtrando por `user_id`, y revalidar la ruta del detalle del ítem. El borrado MUST pedir confirmación al usuario y aplicarse de forma optimista en el cliente, revirtiéndose si la server action falla.

#### Scenario: Borrar una nota con confirmación

- **WHEN** el usuario usa el control para quitar una nota y confirma
- **THEN** la nota se remueve del panel de inmediato, la server action la borra filtrando por `user_id` y el contador se decrementa
- **AND** si el elemento queda sin notas, el ícono vuelve al estado apagado

#### Scenario: Cancelar el borrado

- **WHEN** el usuario usa el control para quitar una nota pero cancela la confirmación
- **THEN** la nota permanece en el panel y nada se persiste

#### Scenario: Rollback ante error de borrado

- **WHEN** el borrado optimista se aplicó en el cliente pero la server action falla
- **THEN** la nota reaparece en el panel y se muestra el mensaje de error en español

### Requirement: Vista centralizada de notas del ítem

El sistema SHALL ofrecer, en el detalle del ítem, un apartado que reúna **todas** las notas del ítem y de sus pasos en un solo lugar. Cada nota MUST estar identificada según su origen: nivel ítem ("proyecto en general"), un módulo (con su nombre) o una tarea (con su nombre y el módulo al que pertenece como contexto). El apartado MUST reflejar en vivo las altas y bajas hechas desde los paneles inline (mismo estado controlled, sin recargar) y MUST ocultarse cuando el ítem no tiene ninguna nota. El diseño MUST respetar los tokens de color del proyecto (dark-only) y ser visualmente refinado.

#### Scenario: Ver todas las notas centralizadas

- **WHEN** un ítem tiene notas en distintos niveles (ítem, módulos, tareas)
- **THEN** el apartado las muestra agrupadas por origen, en el orden jerárquico del ítem (ítem primero, luego cada módulo y sus tareas por posición)
- **AND** cada grupo indica su tipo (Ítem / Módulo / Tarea) y su nombre

#### Scenario: Identificación del origen de una tarea

- **WHEN** una nota pertenece a una tarea
- **THEN** el apartado muestra el nombre de la tarea junto con el módulo al que pertenece como contexto

#### Scenario: Sincronización en vivo con los paneles inline

- **WHEN** el usuario agrega o borra una nota desde el ícono de un elemento
- **THEN** el apartado centralizado refleja el cambio de inmediato, sin recargar la página

#### Scenario: Ítem sin notas

- **WHEN** el ítem no tiene ninguna nota
- **THEN** el apartado centralizado no se muestra

### Requirement: Notas en elementos completados

El sistema SHALL mantener el ícono y el panel de notas accesibles en ítems, módulos y tareas completados, a diferencia del control de fecha límite que se oculta en estado `done`. El usuario MUST poder leer y agregar notas sobre un elemento terminado.

#### Scenario: Notas en un paso completado

- **WHEN** un módulo o una tarea está marcado como completado
- **THEN** su ícono de notas sigue visible
- **AND** el usuario puede abrir el panel, leer las notas existentes y agregar nuevas

