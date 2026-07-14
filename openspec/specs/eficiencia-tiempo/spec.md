# Spec: Eficiencia de tiempo (estimado vs. real)

## Purpose

Permite al usuario declarar un tiempo estimado opcional en proyectos, ítems, módulos y tareas, y compara ese plan contra el tiempo realmente invertido en sesiones. Expone un índice de eficiencia único (tiempo ganado / tiempo real), módulos visuales en el detalle del ítem y del proyecto, y una sección de eficiencia general en `/stats` filtrable por rango de fechas.

---

## Requirements

### Requirement: Modelo de estimación de tiempo por entidad

El sistema SHALL permitir asignar una estimación de tiempo opcional a ítems, pasos (módulos y tareas) y proyectos, persistida como columna `estimated_minutes` de tipo `integer` en las tablas `items`, `item_steps` y `projects`. La columna MUST ser nullable, sin valor por defecto, con `CHECK (estimated_minutes > 0)`. La validación Zod MUST aceptar enteros entre 1 y 100000 minutos y rechazar todo lo demás con mensaje en español. Las políticas RLS existentes de cada tabla MUST cubrir la columna nueva sin políticas adicionales.

#### Scenario: Asignar estimación a un ítem

- **WHEN** el usuario asigna una estimación de 10 horas a un ítem propio
- **THEN** el sistema persiste `items.estimated_minutes = 600` filtrando por `user_id`
- **AND** el detalle del ítem muestra la estimación en el módulo de eficiencia

#### Scenario: Entidades sin estimación por defecto

- **WHEN** el usuario crea un ítem, paso o proyecto sin indicar estimación
- **THEN** la entidad persiste con `estimated_minutes = null`
- **AND** ninguna superficie muestra índices ni gráficas de eficiencia para esa entidad (solo la invitación a estimar donde corresponda)

#### Scenario: Quitar una estimación

- **WHEN** el usuario borra la estimación de una entidad que tenía una asignada
- **THEN** el sistema persiste `estimated_minutes = null`
- **AND** la entidad deja de aportar a los cálculos de eficiencia propios y derivados

#### Scenario: Estimación inválida rechazada

- **WHEN** una server action recibe `estimated_minutes` igual a 0, negativo, no entero o mayor a 100000
- **THEN** la validación Zod rechaza el input con un mensaje en español
- **AND** ningún dato se persiste

#### Scenario: Aislamiento entre usuarios

- **WHEN** el usuario A intenta asignar o quitar la estimación de una entidad del usuario B
- **THEN** la RLS y el filtrado explícito por `user_id` rechazan la operación
- **AND** ningún dato del usuario B se modifica

### Requirement: Configuración de la estimación en formularios

Los formularios existentes SHALL ofrecer un campo opcional "Tiempo estimado" mediante un componente compartido con dos inputs numéricos (horas y minutos) que persiste un único valor en minutos: el formulario de nuevo ítem (`/item/nuevo`), el editor de detalles del ítem (`/item/[id]`), el editor de pasos (por módulo y por tarea, en versión compacta), el formulario de nuevo proyecto (`/proyectos/nuevo`) y el detalle del proyecto. Todos los editores MUST permitir quitar la estimación existente. El campo MUST NOT ser obligatorio en ningún formulario.

#### Scenario: Crear ítem con estimación

- **WHEN** el usuario completa el formulario de nuevo ítem indicando 2 horas 30 minutos
- **THEN** el ítem se crea con `estimated_minutes = 150`
- **AND** el detalle del ítem muestra "2 h 30 m" como estimación

#### Scenario: Crear ítem sin estimación

- **WHEN** el usuario envía el formulario de nuevo ítem dejando horas y minutos vacíos
- **THEN** el ítem se crea con `estimated_minutes = null` sin error de validación

#### Scenario: Editar la estimación de un paso

- **WHEN** el usuario asigna 45 minutos a una tarea desde el editor de pasos
- **THEN** el sistema persiste `item_steps.estimated_minutes = 45` para ese paso filtrando por `user_id`
- **AND** el paso muestra su estimación junto al nombre en el listado

#### Scenario: Quitar la estimación desde un editor

- **WHEN** el usuario usa el control de quitar sobre la estimación de un ítem, paso o proyecto
- **THEN** la columna correspondiente queda en `null`
- **AND** se revalidan las rutas afectadas (detalle de la entidad y `/stats`)

#### Scenario: Input inválido en el componente

- **WHEN** el usuario ingresa valores negativos o no numéricos en horas o minutos
- **THEN** el componente impide el submit con mensaje en español
- **AND** ningún valor se persiste

### Requirement: Estimación efectiva con derivación hacia arriba

El sistema SHALL calcular una **estimación efectiva** por entidad: la estimación propia cuando existe; si no existe, la suma de las estimaciones efectivas de sus hijos directos que tengan una (tareas → módulo, módulos → ítem, ítems miembros → proyecto). Un ítem sin pasos MUST usar solo su estimación propia. Si ni la entidad ni sus hijos tienen estimación, la entidad MUST quedar sin estimación efectiva. Las estimaciones derivadas MUST distinguirse visualmente de las propias (prefijo `≈`) y, cuando la cobertura de hijos es parcial, la UI MUST indicar la cobertura (por ejemplo "suma de 2 de 4 módulos").

#### Scenario: Estimación propia gana sobre la derivada

- **WHEN** un ítem tiene `estimated_minutes = 600` y sus módulos suman 480 minutos de estimaciones
- **THEN** la estimación efectiva del ítem es 600 minutos
- **AND** se muestra sin prefijo `≈` por ser propia

#### Scenario: Ítem deriva de sus módulos

- **WHEN** un ítem sin estimación propia tiene tres módulos con estimaciones de 60, 90 y 120 minutos
- **THEN** la estimación efectiva del ítem es 270 minutos
- **AND** se muestra como "≈ 4 h 30 m"

#### Scenario: Derivación parcial señalada

- **WHEN** un ítem sin estimación propia tiene 4 módulos y solo 2 tienen estimación (60 y 90 minutos)
- **THEN** la estimación efectiva del ítem es 150 minutos
- **AND** la UI indica que la suma cubre 2 de 4 módulos

#### Scenario: Módulo deriva de sus tareas

- **WHEN** un módulo sin estimación propia tiene tareas con estimaciones de 30 y 45 minutos
- **THEN** la estimación efectiva del módulo es 75 minutos
- **AND** esa estimación derivada participa a su vez en la derivación del ítem

#### Scenario: Proyecto deriva de sus ítems

- **WHEN** un proyecto sin estimación propia tiene dos ítems miembros con estimaciones efectivas de 300 y 240 minutos y un tercero sin estimación
- **THEN** la estimación efectiva del proyecto es 540 minutos
- **AND** la UI del proyecto indica la cobertura parcial (2 de 3 ítems)

#### Scenario: Sin estimación en toda la cadena

- **WHEN** una entidad no tiene estimación propia y ninguno de sus hijos tiene estimación
- **THEN** la entidad queda sin estimación efectiva
- **AND** sus superficies muestran la invitación a estimar en lugar de métricas

### Requirement: Índice de eficiencia y estados

El sistema SHALL calcular el índice de eficiencia como `tiempo ganado / tiempo real`, donde `tiempo ganado = progreso (0..1) × estimación efectiva en minutos` y `tiempo real` es la suma de `duration_seconds` de las sesiones de la entidad convertida a minutos. El progreso MUST tomarse del cálculo existente de la app (`computeItemProgress` para ítems, progreso fraccional para módulos, binario para tareas, progreso agregado para proyectos). El índice MUST clasificarse en estados: **Adelantado** (índice ≥ 1.10), **En línea** (0.90 ≤ índice < 1.10) y **Más lento** (índice < 0.90). Independientemente del índice, cuando el tiempo real supera la estimación efectiva y la entidad no está completada, el estado MUST ser **Estimación superada**. El índice MUST NOT calcularse sin estimación efectiva, con tiempo real igual a cero o con progreso igual a cero — en esos casos la UI muestra "Sin datos todavía" o la invitación a estimar según corresponda.

#### Scenario: Ítem completado más rápido que lo estimado

- **WHEN** un ítem con estimación efectiva de 600 minutos se completó con 480 minutos de sesiones
- **THEN** el índice es 1.25
- **AND** el estado es "Adelantado" con el texto "25 % más rápido que lo estimado"

#### Scenario: Ítem en curso en línea con el plan

- **WHEN** un ítem con estimación efectiva de 600 minutos lleva 50 % de progreso y 290 minutos invertidos
- **THEN** el índice es aproximadamente 1.03
- **AND** el estado es "En línea"

#### Scenario: Ítem en curso más lento que el plan

- **WHEN** un ítem con estimación efectiva de 600 minutos lleva 30 % de progreso y 300 minutos invertidos
- **THEN** el índice es 0.60
- **AND** el estado es "Más lento" en color `warning`

#### Scenario: Estimación superada sin terminar

- **WHEN** un ítem con estimación efectiva de 600 minutos acumula 700 minutos de sesiones y no está completado
- **THEN** el estado es "Estimación superada" en color `danger`
- **AND** la gráfica muestra el excedente más allá del marcador de estimación

#### Scenario: Guarda sin datos

- **WHEN** una entidad tiene estimación efectiva pero cero tiempo invertido o cero progreso
- **THEN** no se muestra ningún índice
- **AND** la UI muestra "Sin datos todavía" sin valores engañosos (ni 0 % ni infinito)

#### Scenario: Tarea binaria completada

- **WHEN** una tarea con estimación de 45 minutos quedó completada con 30 minutos atribuidos
- **THEN** su índice es 1.5 y se muestra como "Adelantado"
- **AND** mientras estaba pendiente solo se mostraba su tiempo consumido contra la estimación, sin índice

### Requirement: Atribución de tiempo real por paso

El sistema SHALL atribuir el `duration_seconds` de cada sesión en partes iguales entre los pasos asociados a esa sesión vía `session_steps` (`duración / N` para cada uno de los N pasos). Las sesiones sin pasos asociados MUST sumar al tiempo real del ítem pero a ningún paso. La suma del tiempo atribuido a los pasos de una sesión MUST igualar la duración de la sesión (sin duplicar ni perder tiempo). El tiempo real de un módulo MUST incluir el tiempo atribuido a sus tareas hijas más el atribuido directamente al módulo.

#### Scenario: Sesión repartida entre tres pasos

- **WHEN** una sesión de 90 minutos quedó asociada a tres tareas vía `session_steps`
- **THEN** cada tarea recibe 30 minutos de tiempo atribuido
- **AND** el tiempo total del ítem sigue contando 90 minutos (no 270)

#### Scenario: Sesión sin pasos asociados

- **WHEN** una sesión de 60 minutos se guardó sin seleccionar pasos
- **THEN** los 60 minutos cuentan para el tiempo real del ítem
- **AND** ningún paso recibe tiempo atribuido por esa sesión

#### Scenario: Tiempo del módulo incluye sus tareas

- **WHEN** un módulo tiene 20 minutos atribuidos directamente y sus tareas hijas acumulan 70 minutos atribuidos
- **THEN** el tiempo real del módulo a efectos de eficiencia es 90 minutos

### Requirement: Módulo de eficiencia en el detalle del ítem

El detalle del ítem (`/item/[id]`) SHALL mostrar una sección "Eficiencia" cuando el ítem tiene estimación efectiva. La sección MUST incluir: una gráfica tipo bullet donde el track representa la estimación efectiva, el fill el tiempo real invertido y el excedente (si lo hay) se dibuja más allá del marcador en color `danger`; el índice de eficiencia en lenguaje legible; y el chip de estado. Cuando los pasos del ítem tienen estimaciones, la sección MUST mostrar además un desglose por módulo con mini barras (tiempo atribuido vs. estimación efectiva del módulo). Cuando el ítem no tiene estimación efectiva, la sección MUST mostrar una invitación discreta a estimar con acceso directo al editor.

#### Scenario: Ítem con estimación y sesiones

- **WHEN** el usuario abre el detalle de un ítem con estimación efectiva de 10 horas y 6 horas invertidas al 70 % de progreso
- **THEN** ve la barra bullet con el fill al 60 % del track y el marcador de estimación al final
- **AND** ve el índice ("17 % más rápido que lo estimado") y el chip "Adelantado"

#### Scenario: Desglose por módulos con estimación

- **WHEN** el ítem tiene tres módulos y al menos uno con estimación efectiva
- **THEN** la sección lista los módulos con estimación, cada uno con su mini barra de tiempo atribuido vs. estimado
- **AND** los módulos sin estimación no muestran barra (solo un guion o invitación compacta)

#### Scenario: Ítem sin estimación

- **WHEN** el usuario abre el detalle de un ítem sin estimación propia ni derivada
- **THEN** la sección de eficiencia muestra una invitación del estilo "¿Cuánto tiempo pensás que te va a llevar? Estimalo y medí tu eficiencia"
- **AND** el acceso lleva al campo de estimación del editor de detalles

#### Scenario: Sin sesiones todavía

- **WHEN** el ítem tiene estimación pero ninguna sesión registrada
- **THEN** la sección muestra la estimación y "Sin datos todavía"
- **AND** no se renderiza índice ni chip de estado

### Requirement: Módulo de eficiencia en el detalle del proyecto

El detalle del proyecto (`/proyectos/[id]`) SHALL mostrar una sección "Eficiencia" cuando el proyecto tiene estimación efectiva. La sección MUST incluir la gráfica bullet agregada del proyecto (estimación efectiva vs. suma de tiempo real de los ítems miembros), el índice y el chip de estado calculados con el progreso agregado del proyecto, y un desglose con una fila por ítem miembro con estimación efectiva (mini barra, índice propio y estado). Los ítems miembros sin estimación efectiva MUST listarse aparte como "sin estimación" sin participar del cálculo agregado. Cuando ningún dato permite calcular eficiencia, la sección MUST mostrar la invitación a estimar.

#### Scenario: Proyecto con ítems estimados

- **WHEN** un proyecto tiene estimación efectiva de 20 horas (derivada de sus ítems) y 12 horas invertidas al 65 % de progreso agregado
- **THEN** la sección muestra la barra agregada, el índice y el estado del proyecto
- **AND** debajo lista cada ítem miembro estimado con su mini barra y su estado individual

#### Scenario: Ítems sin estimación excluidos del agregado

- **WHEN** un proyecto tiene tres ítems y uno no tiene estimación efectiva
- **THEN** el cálculo agregado usa solo los dos ítems estimados (estimación, tiempo y progreso)
- **AND** el tercero aparece en un grupo "Sin estimación" con acceso a su detalle

#### Scenario: Proyecto sin ninguna estimación

- **WHEN** ni el proyecto ni sus ítems tienen estimación
- **THEN** la sección muestra la invitación a estimar
- **AND** no se renderiza ninguna barra ni índice

### Requirement: Sección de eficiencia general en `/stats` con rango de fechas

La página `/stats` SHALL incluir una sección "Eficiencia" que agregue las sesiones del rango de fechas seleccionado pertenecientes a ítems con estimación efectiva. El rango MUST controlarse vía search params `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`, con presets (7 días, 30 días, 90 días, este año, todo) y un rango custom con dos inputs de fecha; el default sin params MUST ser los últimos 30 días. La sección MUST mostrar: el índice de eficiencia del período (`tiempo ganado / tiempo invertido` del rango), tiempo invertido y tiempo ganado totales, una gráfica de evolución con las dos series acumuladas día a día (bucketing en la timezone del perfil), y un desglose de los ítems completados dentro del rango con estimado, real y delta legible. El tiempo ganado por sesión MUST calcularse como `(units_progressed / total_units) × estimación efectiva` para ítems por unidades y como la contribución al progreso de los pasos con `completed_in_session = true` multiplicada por la estimación efectiva para ítems por pasos. Las sesiones de ítems sin estimación efectiva MUST quedar fuera de ambas series y la sección MUST mostrar esa cobertura ("X h del período sin estimación"). Todo el cómputo MUST resolverse server-side con queries one-shot filtradas por `user_id`.

#### Scenario: Rango por defecto

- **WHEN** el usuario abre `/stats` sin search params
- **THEN** la sección de eficiencia muestra los últimos 30 días
- **AND** el preset "30 días" aparece activo en el selector

#### Scenario: Cambiar de rango con presets

- **WHEN** el usuario toca el preset "90 días"
- **THEN** la URL pasa a reflejar el rango correspondiente
- **AND** el índice, las series y el desglose se recalculan server-side para ese rango

#### Scenario: Rango custom

- **WHEN** el usuario elige `desde = 2026-01-01` y `hasta = 2026-03-31`
- **THEN** la sección agrega exactamente las sesiones iniciadas dentro de ese rango (timezone del perfil)
- **AND** un rango inválido (desde > hasta o fecha malformada) cae al default sin romper la página

#### Scenario: Evolución acumulada del período

- **WHEN** el rango contiene sesiones de ítems estimados
- **THEN** la gráfica muestra las dos series acumuladas día a día: tiempo invertido y tiempo ganado
- **AND** los tooltips y etiquetas están en español con duraciones legibles

#### Scenario: Índice del período

- **WHEN** en el rango hay 10 horas invertidas y 12 horas ganadas en ítems estimados
- **THEN** el índice del período es 1.2 y se muestra como "Adelantado"
- **AND** los KPI muestran "10 h invertidas · 12 h ganadas"

#### Scenario: Cobertura sin estimación visible

- **WHEN** el rango incluye 4 horas de sesiones en ítems sin estimación efectiva
- **THEN** esas horas no participan del índice ni de las series
- **AND** la sección muestra "4 h del período sin estimación" como aviso de cobertura

#### Scenario: Ítems completados en el rango

- **WHEN** dos ítems estimados pasaron a `status = 'done'` dentro del rango
- **THEN** el desglose lista cada uno con su estimado, su tiempo real total y el delta ("terminado 2 h 15 m antes de lo estimado")
- **AND** los ítems completados fuera del rango no aparecen

#### Scenario: Período sin datos de eficiencia

- **WHEN** el rango no contiene ninguna sesión de ítems con estimación efectiva
- **THEN** la sección muestra un estado vacío que explica cómo empezar a estimar
- **AND** no se renderizan índice ni gráficas vacías

### Requirement: Estética, tokens y consistencia visual

La UI de eficiencia SHALL respetar el sistema de diseño existente: dark-only, tokens del proyecto, componentes compartidos y copy en español argentino con voseo. El sistema SHALL agregar el token `--color-success` en `globals.css` para el estado "Adelantado"; los estados restantes MUST usar los tokens existentes (`accent`, `warning`, `danger`, `muted`). Los estados MUST comunicarse siempre con texto además de color. Las gráficas MUST construirse con Recharts (evolución temporal) y CSS/SVG propio (barras bullet), sin dependencias nuevas. Los componentes MUST NOT hardcodear colores Tailwind crudos.

#### Scenario: Token success agregado y usado

- **WHEN** se renderiza un estado "Adelantado" en cualquier superficie
- **THEN** el color proviene de `var(--color-success)` definido en `globals.css`
- **AND** ninguna clase cruda tipo `text-green-400` aparece en el código

#### Scenario: Estados legibles sin depender del color

- **WHEN** se muestra cualquier chip o índice de eficiencia
- **THEN** el estado incluye su etiqueta textual ("Adelantado", "En línea", "Más lento", "Estimación superada")
- **AND** las duraciones se muestran con el formato legible existente (`formatDuration`)

#### Scenario: Copy en español argentino

- **WHEN** se redactan títulos, chips, tooltips, invitaciones y estados vacíos de eficiencia
- **THEN** la copy usa voseo y términos consistentes ("Tiempo estimado", "Vas adelantado", "Estimalo y medí tu eficiencia")
- **AND** no se introduce internacionalización
