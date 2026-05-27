# stats-by-scope Specification

## Purpose

Mostrar las estadísticas de tiempo, sesiones y categorías **desagregadas** entre estudio y trabajo, para que el usuario pueda comparar y entender en qué se está concentrando. Cubre los totales agregados, el gráfico semanal y el breakdown por categoría. El heatmap anual se mantiene global como narrativa visual de constancia.

## Requirements

### Requirement: Totales agregados separados por scope

La página `/stats` SHALL mostrar los totales (tiempo total acumulado, sesiones, ítems cerrados) **desagregados** entre estudio y trabajo, además de —o en reemplazo de— los totales globales.

#### Scenario: Usuario solo con estudio

- **WHEN** el usuario abre `/stats` y no tiene ítems con `scope = 'work'`
- **THEN** la sección de totales muestra los mismos números que hoy, sin etiquetar específicamente "estudio"
- **AND** no aparecen cifras de trabajo (no hay 0s vacíos que ensucien la vista)

#### Scenario: Usuario con ambos scopes

- **WHEN** el usuario tiene sesiones registradas en ítems de ambos scopes
- **THEN** los totales se presentan en dos columnas o dos chips: una para estudio, otra para trabajo
- **AND** los valores son la suma de `duration_seconds` filtrada por `items.scope` correspondiente

#### Scenario: Usuario solo con trabajo

- **WHEN** el usuario tiene sesiones únicamente en ítems con `scope = 'work'`
- **THEN** los totales aparecen etiquetados como trabajo
- **AND** los textos de la página no mencionan estudio en singular como única narrativa

### Requirement: Vista `daily_minutes` extendida con desglose

La vista (o RPC) `daily_minutes` SHALL devolver, por día y usuario: `minutes` (total), `minutes_study` (suma de minutos donde `items.scope = 'study'`) y `minutes_work` (suma de minutos donde `items.scope = 'work'`).

#### Scenario: Consulta de minutos del último año

- **WHEN** la página `/stats` consulta `daily_minutes` con un filtro `local_date >= cutoff`
- **THEN** cada fila incluye las tres columnas: `minutes`, `minutes_study`, `minutes_work`
- **AND** `minutes = minutes_study + minutes_work` (invariante)

#### Scenario: Día sin sesiones de trabajo

- **WHEN** el usuario tuvo sesiones de estudio pero no de trabajo en un día determinado
- **THEN** la fila de ese día tiene `minutes_work = 0` y `minutes_study = minutes`

### Requirement: Gráfico semanal separado por scope

El gráfico semanal SHALL mostrar el tiempo invertido por día desagregado entre estudio y trabajo, ya sea con dos barras lado a lado, una barra apilada, o cualquier representación que permita leer ambos valores al mismo tiempo.

#### Scenario: Semana con ambos scopes

- **WHEN** el usuario tiene sesiones de estudio y de trabajo en la semana en curso
- **THEN** cada día del gráfico muestra los dos componentes con leyenda clara
- **AND** el total semanal mostrado en texto debajo del gráfico también se desglosa

#### Scenario: Semana solo con estudio

- **WHEN** el usuario solo tiene sesiones de estudio en la semana
- **THEN** el gráfico colapsa a una sola serie como hoy
- **AND** la leyenda no menciona trabajo

### Requirement: Breakdown por categoría filtrable por scope

La sección "Por categoría" de `/stats` SHALL permitir filtrar los minutos por scope (todo / estudio / trabajo).

#### Scenario: Filtro por scope en categorías

- **WHEN** el usuario selecciona "Trabajo" en el filtro de la sección "Por categoría"
- **THEN** la lista de categorías recalcula los minutos sumando solo sesiones de ítems con `scope = 'work'`
- **AND** las categorías que no tienen ningún minuto en ese scope no aparecen

#### Scenario: Filtro "Todo"

- **WHEN** el filtro está en "Todo"
- **THEN** la lista muestra el agregado total como hoy

### Requirement: Heatmap anual queda global

El heatmap anual de `/stats` SHALL seguir mostrando la actividad total (estudio + trabajo) en una única cuadrícula. El sistema NO debe partir el heatmap en dos cuadrículas en este change.

#### Scenario: Día con actividad mixta

- **WHEN** un día tiene sesiones de ambos scopes
- **THEN** la celda del heatmap refleja la intensidad por la suma de minutos del día
- **AND** no se distingue visualmente el scope dentro del heatmap

#### Scenario: Leyenda del heatmap

- **WHEN** se renderiza el heatmap
- **THEN** el texto resumen ("X días con estudio") se actualiza a una versión neutral si hay ítems de trabajo (por ejemplo "X días con actividad")
- **AND** se mantiene la copy actual si el usuario solo tiene estudio
