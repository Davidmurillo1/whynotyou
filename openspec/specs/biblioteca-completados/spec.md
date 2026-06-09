# biblioteca-completados Specification

## Purpose
TBD - created by archiving change separar-items-completados. Update Purpose after archive.
## Requirements
### Requirement: Tabs principales para separar ítems por estado
La Biblioteca SHALL exponer dos vistas mutuamente excluyentes mediante una navegación principal por tabs:
1. **En curso** — ítems que no están completados ni abandonados.
2. **Completados** — ítems completados o abandonados.

La vista activa SHALL persistirse en el query param `?view=current|done` (default: `current`). Cada tab MUST mostrar el conteo de ítems que contiene mediante un badge numérico.

#### Scenario: Default a la vista "En curso"
- **WHEN** el usuario entra a `/biblioteca` sin query params
- **THEN** se muestra la vista "En curso"
- **AND** el tab "En curso" aparece como activo

#### Scenario: Persistencia de la vista en la URL
- **WHEN** el usuario hace click en el tab "Completados"
- **THEN** la URL pasa a `/biblioteca?view=done`
- **AND** se muestran únicamente los ítems completados/abandonados

#### Scenario: Badge con conteo en cada tab
- **WHEN** se renderiza la Biblioteca
- **THEN** el tab "En curso" muestra el número de ítems en curso
- **AND** el tab "Completados" muestra el número de ítems completados/abandonados

#### Scenario: Combinación con filtro de scope
- **WHEN** el usuario tiene activos el tab "En curso" y el filtro de scope "Trabajo"
- **THEN** la URL contiene ambos parámetros (`?scope=work`)
- **AND** ambos filtros se aplican simultáneamente

### Requirement: Clasificación de ítems como "completado"
Un ítem SHALL considerarse "completado" cuando:
- Su `status` es `'done'`, **O**
- Su progreso calculado (`computeItemProgress`) es mayor o igual a 1 (independientemente del `status`).

Un ítem SHALL considerarse "abandonado" únicamente cuando su `status` es `'abandoned'` AND su progreso es menor a 1. Los ítems abandonados aparecen en la vista "Completados" en una sub-sección propia.

#### Scenario: Ítem con progreso 100% va a "Completados"
- **WHEN** el usuario tiene un ítem con `status = 'active'` cuyo progreso es 100%
- **THEN** ese ítem aparece en la vista "Completados", no en "En curso"

#### Scenario: Ítem con status 'done' va a "Completados"
- **WHEN** el usuario tiene un ítem con `status = 'done'`
- **THEN** ese ítem aparece en la vista "Completados" bajo el sub-grupo "Completado"

#### Scenario: Ítem abandonado parcial va a "Completados / Abandonado"
- **WHEN** el usuario tiene un ítem con `status = 'abandoned'` y progreso 60%
- **THEN** ese ítem aparece en la vista "Completados" bajo el sub-grupo "Abandonado"

### Requirement: Porcentaje de progreso consistente entre dashboard y Biblioteca
El porcentaje mostrado en cada fila de la Biblioteca SHALL calcularse usando `computeItemProgress` con los `item_steps` del ítem, exactamente igual que en el dashboard. NO debe calcularse como `current_units / total_units` cuando el ítem tiene pasos, ya que `current_units` puede no reflejar el progreso real basado en módulos.

#### Scenario: Ítem con módulos completados muestra porcentaje correcto
- **WHEN** un ítem tiene 9 módulos y todos están marcados como `is_done`
- **THEN** la Biblioteca muestra 100% para ese ítem

#### Scenario: Coincidencia entre vistas
- **WHEN** un ítem aparece en el dashboard con un porcentaje X
- **THEN** ese mismo ítem en la Biblioteca muestra el mismo porcentaje X

### Requirement: Sub-secciones internas dentro de cada vista
Dentro de cada vista SHALL haber sub-secciones según el estado del ítem:
- Vista "En curso": una sub-sección por cada `status` que tenga ítems (`active`, `paused`), con headers `Activo · N` y `Pausado · N`.
- Vista "Completados": dos sub-secciones, `Completado · N` y `Abandonado · N`, con sus respectivos headers.

Las sub-secciones SHALL omitirse si están vacías.

#### Scenario: Vista "En curso" sin ítems pausados
- **WHEN** el usuario solo tiene ítems con `status = 'active'`
- **THEN** la vista "En curso" muestra únicamente la sub-sección "Activo"

#### Scenario: Vista "Completados" sin abandonados
- **WHEN** el usuario solo tiene ítems con `status = 'done'`
- **THEN** la vista "Completados" muestra únicamente la sub-sección "Completado"

### Requirement: Estado vacío por vista
Cuando el usuario tenga ítems en la biblioteca pero la vista activa no contenga ninguno, SHALL mostrarse un EmptyState con mensaje específico:
- Vista "En curso" vacía: "No tenés ítems en curso en esta vista."
- Vista "Completados" vacía: "Todavía no completaste ningún ítem en esta vista."

#### Scenario: Vista "En curso" vacía pero hay completados
- **WHEN** el usuario tiene solo ítems completados/abandonados
- **THEN** la vista "En curso" muestra el EmptyState correspondiente
- **AND** el tab "Completados" muestra el conteo con los ítems disponibles

