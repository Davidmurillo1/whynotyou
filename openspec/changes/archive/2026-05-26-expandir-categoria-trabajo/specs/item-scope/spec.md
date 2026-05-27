## ADDED Requirements

### Requirement: Atributo `scope` en ítems

Cada ítem SHALL tener un atributo `scope` que clasifica su naturaleza entre `study` (estudio) y `work` (trabajo). El valor MUST estar definido para todo ítem persistido. El sistema MUST aceptar únicamente los valores `study` y `work`.

#### Scenario: Default al crear un ítem sin especificar scope

- **WHEN** se crea un ítem y el formulario no envía un valor de `scope`
- **THEN** el sistema persiste el ítem con `scope = 'study'`
- **AND** el ítem se comporta exactamente igual que un ítem creado antes de esta capability

#### Scenario: Crear un ítem de trabajo

- **WHEN** el usuario crea un ítem y selecciona "Trabajo" en el selector de scope
- **THEN** el sistema persiste el ítem con `scope = 'work'`
- **AND** el ítem aparece como tal en cabecera de detalle y en filtros de la biblioteca

#### Scenario: Migración de ítems existentes

- **WHEN** la migración de schema se aplica a una base con ítems preexistentes sin columna `scope`
- **THEN** todos esos ítems quedan con `scope = 'study'` por default
- **AND** el comportamiento del producto para esos ítems no cambia

#### Scenario: Validación de valor inválido

- **WHEN** una server action recibe un `scope` distinto de `study` o `work`
- **THEN** la validación Zod rechaza el input con un mensaje de error
- **AND** el ítem no se crea ni se modifica

### Requirement: Cambio de scope post-creación

El usuario SHALL poder cambiar el `scope` de un ítem después de creado, sin perder sesiones, pasos ni progreso.

#### Scenario: Cambiar scope desde el detalle del ítem

- **WHEN** el usuario abre el detalle de un ítem y elige cambiar su scope al opuesto
- **THEN** el sistema actualiza el `scope` filtrando por `user_id` además de `id`
- **AND** las sesiones existentes se mantienen, pero su contribución a stats pasa al nuevo scope
- **AND** los pasos existentes se mantienen sin cambios

### Requirement: Filtro por scope en biblioteca

La biblioteca SHALL ofrecer un filtro visible que permita ver "Todo", "Estudio" o "Trabajo".

#### Scenario: Default "Todo"

- **WHEN** el usuario abre `/biblioteca` sin haber elegido un filtro
- **THEN** se muestran todos los ítems (study + work) ordenados como hoy
- **AND** el tab "Todo" está activo

#### Scenario: Filtrar por estudio

- **WHEN** el usuario selecciona el filtro "Estudio"
- **THEN** la lista muestra solo los ítems con `scope = 'study'`
- **AND** los ítems de trabajo no aparecen hasta cambiar el filtro

#### Scenario: Filtrar por trabajo

- **WHEN** el usuario selecciona el filtro "Trabajo"
- **THEN** la lista muestra solo los ítems con `scope = 'work'`

#### Scenario: Filtro no persistente

- **WHEN** el usuario filtra por "Trabajo" y luego cierra la pestaña, navega a otra ruta y vuelve a `/biblioteca`
- **THEN** el filtro vuelve a "Todo" (no se persiste entre sesiones de navegación)

### Requirement: Agrupación por scope en el dashboard

El dashboard "Hoy" SHALL agrupar los ítems activos por scope cuando el usuario tiene ítems de ambos.

#### Scenario: Solo ítems de estudio

- **WHEN** el usuario tiene ítems activos únicamente con `scope = 'study'`
- **THEN** el dashboard se ve exactamente como antes de este change (sin etiquetas de scope, sin secciones separadas)

#### Scenario: Solo ítems de trabajo

- **WHEN** el usuario tiene ítems activos únicamente con `scope = 'work'`
- **THEN** el dashboard muestra esos ítems sin secciones separadas
- **AND** el copy del greeting se adapta para mencionar trabajo en vez de estudio

#### Scenario: Ítems de ambos scopes

- **WHEN** el usuario tiene ítems activos de los dos scopes
- **THEN** el dashboard muestra dos secciones con encabezados claros (por ejemplo "Estudio" y "Trabajo")
- **AND** cada sección lista los ítems del scope correspondiente

### Requirement: Edición de atributos del ítem después de creado

El usuario SHALL poder editar `title`, `kind`, `unit_type`, `total_units` y `source_url` de un ítem ya creado, desde la página de detalle del ítem.

#### Scenario: Editar el título

- **WHEN** el usuario abre el editor de detalles del ítem, cambia el título y guarda
- **THEN** el nuevo título se persiste filtrando por `user_id`
- **AND** el cambio se refleja en cabecera, biblioteca y dashboard

#### Scenario: Editar la cantidad total de unidades

- **WHEN** el usuario cambia `total_units` (por ejemplo, de 12 módulos a 15)
- **THEN** el cambio se persiste
- **AND** el progreso del ítem se recalcula con el nuevo total

#### Scenario: Bajar total_units por debajo de current_units

- **WHEN** el usuario reduce `total_units` a un valor menor que `current_units`
- **THEN** la server action ajusta `current_units = total_units` para evitar progreso > 100%
- **AND** ambos campos se persisten en la misma operación

#### Scenario: Cambiar la unidad de medida

- **WHEN** el usuario cambia `unit_type` (por ejemplo, de "páginas" a "capítulos")
- **THEN** la nueva unidad se persiste
- **AND** las vistas del ítem usan el nuevo `unit_type` para mostrar `current_units / total_units`

#### Scenario: Validación de campos

- **WHEN** la server action recibe un `title` vacío, un `total_units` ≤ 0 o un `source_url` malformado
- **THEN** la validación Zod rechaza el input con un mensaje en español
- **AND** ningún cambio se persiste

### Requirement: Copy adaptativo según presencia de ítems de trabajo

Los textos del greeting y de los empty states SHALL adaptar su voz cuando el usuario tiene al menos un ítem activo de trabajo.

#### Scenario: Solo estudio — copy actual

- **WHEN** el usuario no tiene ítems con `scope = 'work'` activos
- **THEN** el greeting y los empty states usan exactamente la copy actual ("lo que estás aprendiendo", "estudio", etc.)

#### Scenario: Hay trabajo — copy ampliado

- **WHEN** el usuario tiene al menos un ítem activo con `scope = 'work'`
- **THEN** el greeting y los empty states usan una voz neutral ("lo que tenés entre manos", "lo que estás haciendo")
- **AND** no usa "estudio" como término exclusivo
