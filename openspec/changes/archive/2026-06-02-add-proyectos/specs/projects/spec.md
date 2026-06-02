## ADDED Requirements

### Requirement: Modelo de proyecto

El sistema SHALL ofrecer un recurso `project` por usuario, con los campos `id`, `user_id`, `name`, `description`, `color`, `emoji`, `status` (`active` | `archived`), `order_index`, `created_at`, `updated_at`. El campo `name` MUST tener entre 1 y 80 caracteres; el resto MAY ser nulo o tener default. Cada proyecto MUST pertenecer a un único `user_id` y MUST quedar protegido por RLS para que ningún usuario acceda a proyectos de otro.

#### Scenario: Crear un proyecto con datos válidos

- **WHEN** el usuario envía el formulario de "Nuevo proyecto" con `name = "Lanzar side-project"` y elige color y emoji
- **THEN** el sistema persiste un registro en `projects` con `user_id` igual al usuario actual, `status = 'active'` y los datos enviados
- **AND** la app redirige al detalle `/proyectos/[id]` del proyecto creado

#### Scenario: Validar nombre vacío

- **WHEN** el usuario envía el formulario con `name = ""` o solo espacios
- **THEN** la validación Zod rechaza el input con un mensaje en español
- **AND** el proyecto no se persiste

#### Scenario: Validar largo máximo del nombre

- **WHEN** el usuario envía un `name` de más de 80 caracteres
- **THEN** la validación Zod rechaza el input
- **AND** el proyecto no se persiste

#### Scenario: Aislamiento entre usuarios

- **WHEN** el usuario A intenta leer, actualizar o borrar un proyecto cuyo `user_id` es del usuario B
- **THEN** la RLS de Supabase devuelve cero filas para lecturas y rechaza la mutación
- **AND** la server action además filtra por `.eq('user_id', user.id)` como defensa en profundidad

### Requirement: Pertenencia N:M entre proyectos e ítems

El sistema SHALL permitir que un ítem pertenezca a cero, uno o varios proyectos al mismo tiempo, sin restricciones por `category_id` ni por `scope` del ítem. La relación SHALL persistirse en una tabla join `project_items` con clave primaria compuesta `(project_id, item_id)`, replicando `user_id` para simplificar políticas RLS.

#### Scenario: Agregar un ítem a un proyecto

- **WHEN** el usuario selecciona un ítem desde el picker en el detalle del proyecto y confirma
- **THEN** el sistema inserta una fila en `project_items` con `(project_id, item_id, user_id)`
- **AND** la lista de ítems del proyecto refleja al ítem agregado

#### Scenario: Pertenencia idempotente

- **WHEN** el usuario intenta agregar al mismo proyecto un ítem que ya está dentro
- **THEN** la operación no falla
- **AND** no se crea una fila duplicada (la PK compuesta lo garantiza)

#### Scenario: Un ítem en varios proyectos

- **WHEN** el usuario agrega un mismo ítem al "Proyecto A" y al "Proyecto B"
- **THEN** ambos proyectos muestran ese ítem en sus listados
- **AND** las stats individuales del ítem no se duplican (las sesiones siguen siendo del ítem)

#### Scenario: Mezcla libre de scope

- **WHEN** el usuario agrega a un mismo proyecto un ítem con `scope = 'study'` y otro con `scope = 'work'`
- **THEN** el sistema acepta ambos sin advertencias ni restricciones
- **AND** el detalle del proyecto los lista juntos con su chip de scope correspondiente

#### Scenario: Mezcla libre de categoría

- **WHEN** el usuario agrega a un mismo proyecto ítems con `category_id` distintos (o sin categoría)
- **THEN** el sistema acepta la combinación
- **AND** cada ítem mantiene su `<CategoryBadge>` original en el listado del proyecto

#### Scenario: Quitar un ítem de un proyecto

- **WHEN** el usuario quita un ítem desde el detalle del proyecto
- **THEN** el sistema elimina la fila correspondiente en `project_items`
- **AND** el ítem sigue existiendo con todas sus sesiones, pasos y atributos intactos
- **AND** otros proyectos que contengan ese ítem no se ven afectados

#### Scenario: Validación de ownership cruzada

- **WHEN** una server action recibe un `project_id` o un `item_id` que no pertenece al `user_id` actual
- **THEN** la operación se rechaza
- **AND** no se persiste ninguna fila en `project_items`

### Requirement: Edición y archivado de proyectos

El usuario SHALL poder renombrar, cambiar color/emoji/descripción, archivar y desarchivar un proyecto sin afectar a los ítems que contiene.

#### Scenario: Renombrar un proyecto

- **WHEN** el usuario abre el detalle del proyecto y edita el nombre
- **THEN** el sistema persiste el nuevo `name` filtrando por `user_id`
- **AND** las vistas que muestran el proyecto reflejan el nombre nuevo

#### Scenario: Archivar un proyecto

- **WHEN** el usuario marca un proyecto como archivado
- **THEN** el sistema cambia `status` a `'archived'`
- **AND** los ítems del proyecto siguen sin cambios
- **AND** el proyecto deja de listarse en la sección "Activos" y aparece bajo "Archivados"

#### Scenario: Desarchivar un proyecto

- **WHEN** el usuario desarchiva un proyecto
- **THEN** `status` vuelve a `'active'`
- **AND** el proyecto reaparece en la sección "Activos"

### Requirement: Eliminación segura de proyectos

El usuario SHALL poder eliminar un proyecto. La eliminación MUST borrar el proyecto y sus filas en `project_items` mediante `ON DELETE CASCADE`, pero MUST NOT borrar los ítems asociados.

#### Scenario: Eliminar proyecto con ítems dentro

- **WHEN** el usuario confirma la eliminación de un proyecto con tres ítems miembros
- **THEN** el proyecto y las tres filas en `project_items` quedan eliminados
- **AND** los tres ítems siguen existiendo, conservando sesiones, pasos, categoría y scope
- **AND** la UI confirma explícitamente antes de eliminar que "no se borrarán los ítems"

#### Scenario: Eliminar proyecto vacío

- **WHEN** el usuario elimina un proyecto sin ítems
- **THEN** el proyecto se elimina sin efectos colaterales

### Requirement: Listado de proyectos en `/proyectos`

La app SHALL ofrecer una página `/proyectos` que liste todos los proyectos del usuario actual, agrupados por `status` (`active` arriba, `archived` debajo), con conteo de ítems por proyecto y acceso al detalle de cada uno.

#### Scenario: Listado con proyectos activos y archivados

- **WHEN** el usuario abre `/proyectos` y tiene 2 activos y 1 archivado
- **THEN** se muestran dos secciones: "Activos" con los 2 proyectos y "Archivados" con 1
- **AND** cada item del listado muestra nombre, emoji (si tiene), color, conteo de ítems y porcentaje agregado

#### Scenario: Empty state

- **WHEN** el usuario abre `/proyectos` y no tiene ningún proyecto
- **THEN** se muestra un `<EmptyState>` con copy en español argentino
- **AND** un CTA "Crear proyecto" redirige a `/proyectos/nuevo`

#### Scenario: Acceso al detalle

- **WHEN** el usuario hace click sobre cualquier item del listado
- **THEN** se navega a `/proyectos/[id]`

### Requirement: Detalle del proyecto en `/proyectos/[id]`

La app SHALL ofrecer una página `/proyectos/[id]` que muestre el progreso agregado del proyecto, los ítems miembros con su progreso individual y acciones para gestionar la pertenencia.

#### Scenario: Detalle con ítems

- **WHEN** el usuario abre el detalle de un proyecto con 3 ítems miembros
- **THEN** se muestra un encabezado con nombre, emoji y color del proyecto
- **AND** un bloque con el progreso agregado calculado como `sum(current_units) / sum(total_units)` sobre los 3 ítems
- **AND** una lista con los 3 ítems, cada uno con `<ProgressRing>`, scope chip, badge de categoría (si tiene) y unit_type
- **AND** controles para agregar más ítems, quitar ítems existentes, editar el proyecto y archivarlo/eliminarlo

#### Scenario: Detalle sin ítems

- **WHEN** el usuario abre un proyecto recién creado sin ítems
- **THEN** el progreso agregado se muestra como `0%` y "0 de 0 ítems"
- **AND** un `<EmptyState>` invita a agregar el primer ítem con un CTA visible

#### Scenario: Proyecto inexistente

- **WHEN** el usuario navega a `/proyectos/<uuid-no-existente>` o a un proyecto de otro usuario
- **THEN** se muestra una página `not-found` análoga a la de `/item/[id]`

#### Scenario: Cálculo de progreso ignora división por cero

- **WHEN** el detalle se renderiza y `sum(total_units)` es 0
- **THEN** el progreso se muestra como `0%` sin lanzar error

### Requirement: Gestión de proyectos desde el detalle del ítem

La app SHALL exponer en `/item/[id]` una sección "Proyectos" que muestre los proyectos a los que pertenece el ítem y permita modificar esa pertenencia.

#### Scenario: Ítem sin proyectos

- **WHEN** el usuario abre el detalle de un ítem que no pertenece a ningún proyecto
- **THEN** la sección muestra un CTA "Agregar a un proyecto" sin chips visibles

#### Scenario: Ítem en uno o más proyectos

- **WHEN** el ítem pertenece a uno o más proyectos
- **THEN** se renderiza un chip `<ProjectBadge>` por cada proyecto
- **AND** cada chip linkea a `/proyectos/[id]`
- **AND** existe un botón "Gestionar" que abre un picker multi-select de proyectos

#### Scenario: Modificar el set de proyectos del ítem

- **WHEN** el usuario abre el picker, marca dos proyectos nuevos y desmarca uno existente, y confirma
- **THEN** el sistema sincroniza `project_items` insertando los nuevos y borrando el que fue desmarcado, todo filtrando por `user_id`
- **AND** la UI refleja el nuevo set de chips sin recargar la página

### Requirement: Visibilidad de proyectos en la biblioteca

La biblioteca SHALL mostrar, junto a la categoría del ítem, una indicación visual de los proyectos a los que pertenece.

#### Scenario: Ítem en un proyecto

- **WHEN** la biblioteca se renderiza y un ítem pertenece a un solo proyecto
- **THEN** se muestra un chip `<ProjectBadge>` con el nombre y color del proyecto al lado del `<CategoryBadge>`

#### Scenario: Ítem en múltiples proyectos

- **WHEN** un ítem pertenece a más de un proyecto
- **THEN** se muestra el chip del primer proyecto (orden por `order_index` ascendente) y un sufijo `+N` con la cantidad restante

#### Scenario: Ítem sin proyectos

- **WHEN** un ítem no pertenece a ningún proyecto
- **THEN** no se muestra ningún chip de proyecto

#### Scenario: Performance — sin N+1

- **WHEN** la biblioteca trae N ítems
- **THEN** la pertenencia se obtiene con **una sola** query a `project_items` filtrada por `user_id` y se cruza en memoria

### Requirement: Navegación principal incluye Proyectos

El layout autenticado SHALL incluir una entrada "Proyectos" en la navegación principal (header desktop y nav inferior móvil), ubicada entre "Biblioteca" y "Categorías".

#### Scenario: Navegación desktop

- **WHEN** el usuario está autenticado y la viewport es ≥ md
- **THEN** el header muestra los links en orden: Hoy, Biblioteca, Proyectos, Categorías, Stats, Ajustes

#### Scenario: Navegación móvil

- **WHEN** la viewport es < md
- **THEN** la nav inferior muestra los seis ítems en un grid `grid-cols-6`
- **AND** la entrada "Proyectos" abre `/proyectos`

### Requirement: Estética dark-only y minimalista

La UI de proyectos SHALL respetar el sistema de diseño existente: usar tokens del proyecto, componentes compartidos y copy en español argentino. La UI MUST NOT introducir un theme switcher ni hardcodear colores Tailwind crudos.

#### Scenario: Tokens de color

- **WHEN** se desarrollan las páginas y componentes de proyectos
- **THEN** se usan los tokens `bg-bg`, `bg-surface`, `bg-surface-2`, `text-text`, `text-muted`, `text-accent`, `border-border`, `bg-danger`
- **AND** no se usan clases como `bg-gray-800` o `text-gray-400`

#### Scenario: Componentes reutilizados

- **WHEN** se renderizan progreso, listas vacías y botones
- **THEN** se usan `<ProgressRing>`, `<EmptyState>` y `<Button>` existentes
- **AND** los nuevos componentes `<ProjectBadge>` y `<ProjectPicker>` siguen la misma estética que `<CategoryBadge>` y los formularios actuales

#### Scenario: Idioma

- **WHEN** se redactan títulos, descripciones, botones y mensajes de error
- **THEN** la copy está en español argentino ("Crear proyecto", "Agregá ítems", "Borrá si querés", etc.)
- **AND** no se introduce internacionalización
