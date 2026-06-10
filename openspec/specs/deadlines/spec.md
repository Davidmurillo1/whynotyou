# Spec: Deadlines (fechas límite)

## Purpose

Permite al usuario asignar una fecha límite opcional a proyectos, ítems y pasos (módulos y tareas). Una página `/agenda` centraliza todos los deadlines pendientes del usuario en tres vistas conmutables (Lista, Calendario, Línea de tiempo). El sistema calcula la urgencia server-side contra la timezone del perfil y la expone en un componente `<DeadlineBadge>` consistente en todas las superficies.

---

## Requirements

### Requirement: Modelo de fecha límite por entidad

El sistema SHALL permitir asignar una fecha límite opcional a proyectos, ítems y pasos (módulos y tareas), persistida como columna `deadline` de tipo `date` (sin hora) en las tablas `projects`, `items` e `item_steps`. La columna MUST ser nullable, sin valor por defecto, y MUST quedar cubierta por las políticas RLS existentes de cada tabla. Toda interpretación de la fecha ("vencido", "hoy", "mañana") MUST computarse contra el día actual en la `timezone` del perfil del usuario, calculado server-side.

#### Scenario: Asignar fecha límite a un ítem

- **WHEN** el usuario asigna la fecha `2026-07-15` a un ítem propio
- **THEN** el sistema persiste `items.deadline = '2026-07-15'` filtrando por `user_id`
- **AND** la fecha queda visible en el detalle del ítem y en la agenda

#### Scenario: Entidades sin fecha límite por defecto

- **WHEN** el usuario crea un proyecto, un ítem o un paso sin indicar fecha
- **THEN** la entidad persiste con `deadline = null`
- **AND** no aparece en la agenda ni muestra ningún indicador de fecha

#### Scenario: Quitar una fecha límite

- **WHEN** el usuario quita la fecha límite de una entidad que tenía una asignada
- **THEN** el sistema persiste `deadline = null`
- **AND** la entidad desaparece de la agenda y de los indicadores de urgencia

#### Scenario: Fecha inválida rechazada

- **WHEN** una server action recibe un valor de fecha que no es `YYYY-MM-DD` válido (o cae fuera del rango de sanidad 2000-01-01 a hoy + 50 años)
- **THEN** la validación Zod rechaza el input con un mensaje en español
- **AND** ningún dato se persiste

#### Scenario: Fechas pasadas permitidas

- **WHEN** el usuario asigna deliberadamente una fecha anterior al día actual
- **THEN** el sistema la acepta y la persiste
- **AND** la entidad aparece inmediatamente como vencida

#### Scenario: Aislamiento entre usuarios

- **WHEN** el usuario A intenta asignar o quitar la fecha límite de una entidad del usuario B
- **THEN** la RLS y el filtrado explícito por `user_id` rechazan la operación
- **AND** ningún dato del usuario B se modifica

### Requirement: Asignación de fecha límite en ítems

El formulario de nuevo ítem (`/item/nuevo`) y el editor de detalles del ítem (`/item/[id]`) SHALL ofrecer un campo opcional "Fecha límite" usando el input de fecha nativo del sistema (`<input type="date">`). El editor MUST permitir quitar la fecha existente.

#### Scenario: Crear ítem con fecha límite

- **WHEN** el usuario completa el formulario de nuevo ítem e indica una fecha límite
- **THEN** el ítem se crea con esa `deadline`
- **AND** el detalle del ítem la muestra con su indicador de urgencia

#### Scenario: Crear ítem sin fecha límite

- **WHEN** el usuario envía el formulario dejando el campo de fecha vacío
- **THEN** el ítem se crea con `deadline = null` sin error de validación

#### Scenario: Editar la fecha desde el detalle del ítem

- **WHEN** el usuario cambia la fecha límite desde el editor de detalles del ítem
- **THEN** la server action persiste el nuevo valor filtrando por `user_id`
- **AND** se revalidan las rutas afectadas (detalle, dashboard, biblioteca y agenda)

#### Scenario: Quitar la fecha desde el detalle del ítem

- **WHEN** el usuario usa el control "Quitar" sobre la fecha límite del ítem
- **THEN** `items.deadline` queda en `null`
- **AND** el ítem deja de aparecer en la agenda

### Requirement: Asignación de fecha límite en pasos

El editor de pasos del detalle del ítem SHALL permitir asignar, cambiar y quitar una fecha límite por paso, tanto en módulos como en tareas. Un paso con fecha MUST mostrar un chip con la fecha y su urgencia junto al nombre.

#### Scenario: Asignar fecha a un módulo

- **WHEN** el usuario asigna una fecha límite a un módulo desde el editor de pasos
- **THEN** el sistema persiste `item_steps.deadline` para ese paso
- **AND** el módulo muestra el chip de fecha en el listado de pasos

#### Scenario: Asignar fecha a una tarea

- **WHEN** el usuario asigna una fecha límite a una tarea (paso con `parent_step_id`)
- **THEN** el sistema la persiste igual que para un módulo
- **AND** la tarea aparece en la agenda identificada con el ítem al que pertenece

#### Scenario: Quitar la fecha de un paso

- **WHEN** el usuario quita la fecha límite de un paso
- **THEN** `item_steps.deadline` queda en `null`
- **AND** el chip de fecha desaparece del listado de pasos

### Requirement: Asignación de fecha límite en proyectos

El formulario de nuevo proyecto (`/proyectos/nuevo`) y el detalle del proyecto (`/proyectos/[id]`) SHALL ofrecer un campo opcional "Fecha límite" con las mismas reglas de validación, edición y quita que los ítems.

#### Scenario: Crear proyecto con fecha límite

- **WHEN** el usuario crea un proyecto indicando una fecha límite
- **THEN** el proyecto se persiste con esa `deadline`
- **AND** el detalle del proyecto la muestra con su indicador de urgencia

#### Scenario: Editar o quitar la fecha desde el detalle del proyecto

- **WHEN** el usuario cambia o quita la fecha límite desde el detalle del proyecto
- **THEN** la server action persiste el cambio filtrando por `user_id`
- **AND** la agenda refleja el cambio en la próxima carga

### Requirement: Página `/agenda` con vistas conmutables

La app SHALL ofrecer una página `/agenda` (autenticada, en la navegación principal) que concentre todos los deadlines pendientes del usuario y permita leerlos en tres vistas conmutables mediante un control segmentado: **Lista**, **Calendario** y **Línea de tiempo**. La vista default MUST ser Lista y la última vista elegida MUST recordarse en el cliente (`localStorage`) entre visitas. El cambio de vista MUST ser instantáneo (sin refetch).

#### Scenario: Acceso con deadlines pendientes

- **WHEN** el usuario con deadlines pendientes abre `/agenda` por primera vez
- **THEN** ve la vista Lista con todas sus entradas pendientes
- **AND** el control segmentado muestra las tres vistas disponibles

#### Scenario: Conmutar de vista y recordar la elección

- **WHEN** el usuario cambia a la vista Calendario y vuelve a `/agenda` en una visita posterior
- **THEN** la página abre directamente en Calendario
- **AND** el cambio entre vistas no dispara una nueva carga de datos

#### Scenario: Empty state sin ningún deadline

- **WHEN** el usuario no tiene ninguna entidad con fecha límite pendiente
- **THEN** la página muestra un `<EmptyState>` que explica cómo asignar fechas límite (desde ítems, pasos o proyectos)
- **AND** no se renderiza el control segmentado de vistas

#### Scenario: Navegar a la entidad

- **WHEN** el usuario toca una entrada de la agenda (en cualquiera de las tres vistas)
- **THEN** navega al detalle correspondiente: `/proyectos/[id]` para proyectos, `/item/[id]` para ítems y pasos

### Requirement: Contenido de la agenda — todos los deadlines pendientes

La agenda SHALL incluir exactamente las entidades con `deadline` no nulo que sigan pendientes: ítems con `status` `active` o `paused`; proyectos con `status = 'active'`; pasos con `is_done = false` cuyo ítem no esté `done` ni `abandoned`. Las entidades completadas, archivadas o abandonadas MUST excluirse automáticamente. Los deadlines vencidos MUST permanecer visibles hasta que la entidad se complete o se le quite la fecha.

#### Scenario: Ítem completado desaparece de la agenda

- **WHEN** un ítem con fecha límite pasa a `status = 'done'`
- **THEN** la agenda deja de listarlo
- **AND** sus pasos con fecha también se excluyen

#### Scenario: Paso completado desaparece de la agenda

- **WHEN** el usuario marca como completado un paso que tenía fecha límite
- **THEN** ese paso deja de aparecer en la agenda
- **AND** los demás pasos pendientes del mismo ítem permanecen

#### Scenario: Proyecto archivado desaparece de la agenda

- **WHEN** un proyecto con fecha límite pasa a `status = 'archived'`
- **THEN** la agenda deja de listarlo

#### Scenario: Vencidos permanecen visibles

- **WHEN** la fecha límite de una entidad pendiente quedó en el pasado
- **THEN** la entidad sigue listada en la agenda bajo el grupo o franja de vencidos
- **AND** ningún proceso cambia automáticamente su estado

#### Scenario: Ítem en pausa sigue compromisado

- **WHEN** un ítem con fecha límite está en `status = 'paused'`
- **THEN** sigue apareciendo en la agenda
- **AND** la fila da contexto de que el ítem está en pausa

### Requirement: Vista Lista agrupada por urgencia

La vista Lista SHALL agrupar las entradas pendientes en este orden fijo: **Vencidos**, **Hoy**, **Mañana**, **Esta semana**, **Este mes**, **Más adelante** — calculados contra el día actual en la timezone del perfil, con semanas de lunes a domingo y mes calendario. Los grupos vacíos MUST NOT renderizarse. Dentro de cada grupo las entradas MUST ordenarse por fecha ascendente. Cada fila MUST mostrar el tipo de entidad, el título, su contexto jerárquico (ítem padre para pasos; primer proyecto para ítems que pertenezcan a alguno), el indicador de urgencia y el progreso actual cuando la entidad lo tenga.

#### Scenario: Agrupado correcto

- **WHEN** el usuario tiene un paso vencido, un ítem que vence hoy y un proyecto que vence en tres semanas dentro del mismo mes
- **THEN** la lista muestra los grupos "Vencidos", "Hoy" y "Este mes" con cada entrada en su grupo
- **AND** los grupos "Mañana", "Esta semana" y "Más adelante" no se renderizan

#### Scenario: Contexto jerárquico en la fila

- **WHEN** la lista muestra una tarea con fecha límite
- **THEN** la fila incluye el título del ítem al que pertenece como texto secundario
- **AND** tocar la fila navega al detalle de ese ítem

#### Scenario: Orden dentro del grupo

- **WHEN** un grupo contiene varias entradas
- **THEN** se ordenan por fecha límite ascendente (y los vencidos del más antiguo al más reciente)

### Requirement: Vista Calendario mensual

La vista Calendario SHALL mostrar un mes en grilla de 7 columnas comenzando en lunes, con navegación al mes anterior/siguiente y un control para volver al mes actual. Cada día con deadlines MUST mostrar un indicador visual (hasta 3 puntos coloreados según la urgencia más alta del día, con "+N" si hay más). Al seleccionar un día, la página MUST mostrar debajo de la grilla la lista de deadlines de ese día con las mismas filas que la vista Lista. El día actual MUST estar señalado visualmente y los días de meses adyacentes atenuados.

#### Scenario: Días con deadlines marcados

- **WHEN** el mes visible tiene tres días con deadlines
- **THEN** esos tres días muestran sus indicadores coloreados por urgencia
- **AND** los demás días no muestran indicador

#### Scenario: Seleccionar un día

- **WHEN** el usuario toca un día con dos deadlines
- **THEN** debajo de la grilla aparecen esas dos entradas con título, contexto y urgencia
- **AND** tocar una entrada navega a la entidad

#### Scenario: Navegar entre meses

- **WHEN** el usuario avanza dos meses y luego usa el control "Hoy"
- **THEN** la grilla vuelve al mes actual sin recargar datos
- **AND** el día actual aparece señalado

### Requirement: Vista Línea de tiempo

La vista Línea de tiempo SHALL mostrar las entradas pendientes como barras horizontales sobre un eje temporal que arranca en el día actual: cada barra MUST extenderse desde hoy hasta su fecha límite (su largo representa el tiempo restante), coloreada según la urgencia, con marcas de referencia de tiempo (hoy, 1 semana, 2 semanas, 1 mes). El eje MUST cubrir al menos 4 semanas y como máximo 12; los deadlines posteriores se anclan al borde derecho con una indicación de desborde. Las entradas vencidas MUST mostrarse en una franja propia al inicio, sin barra de pista, con el tiempo transcurrido desde el vencimiento. Cuando la entidad tiene progreso medible, la fila MUST mostrar su porcentaje actual de avance.

#### Scenario: Barras proporcionales al tiempo restante

- **WHEN** el usuario tiene un ítem que vence en 7 días y un proyecto que vence en 14
- **THEN** la barra del proyecto mide aproximadamente el doble que la del ítem
- **AND** ambas arrancan en el borde izquierdo del eje (hoy)

#### Scenario: Vencidos en franja propia

- **WHEN** existe un paso con fecha límite vencida hace 3 días
- **THEN** aparece al inicio de la vista en la franja de vencidos con "Venció hace 3 días"
- **AND** no se le dibuja barra de pista

#### Scenario: Progreso visible junto a la pista

- **WHEN** un ítem con 40% de avance vence en 10 días
- **THEN** su fila muestra la barra de tiempo restante y el "40%" de progreso actual
- **AND** un proyecto muestra su progreso agregado calculado sobre sus ítems

#### Scenario: Deadline más allá del horizonte

- **WHEN** una entrada vence en 6 meses
- **THEN** su barra se ancla al borde derecho del eje con la indicación de que continúa más allá
- **AND** la fila conserva su fecha textual exacta

### Requirement: Indicador de urgencia consistente

El sistema SHALL clasificar todo deadline pendiente en exactamente cuatro niveles de urgencia calculados contra el día actual en la timezone del perfil: `overdue` (anterior a hoy), `today` (hoy), `soon` (dentro de los próximos 7 días) y `later` (posterior). Un único componente `<DeadlineBadge>` MUST renderizar el nivel en todas las superficies (agenda, dashboard, biblioteca, detalle de ítem, editor de pasos, detalle de proyecto) con esta correspondencia: `overdue` en color `danger` ("Venció ayer" / "Venció hace N días"), `today` y `soon` en color `warning` ("Vence hoy" / "Vence mañana" / "Vence en N días"), `later` en color `muted` (fecha corta). El token `--color-warning` MUST agregarse a los tokens del sistema en `globals.css`; los componentes MUST NOT hardcodear colores Tailwind crudos.

#### Scenario: Vencido en danger

- **WHEN** una entidad pendiente tiene fecha límite anterior a hoy (timezone del perfil)
- **THEN** su badge se muestra en color `danger` con el texto relativo ("Venció hace 5 días")

#### Scenario: Vence hoy en warning

- **WHEN** la fecha límite coincide con el día actual del perfil
- **THEN** el badge muestra "Vence hoy" en color `warning`

#### Scenario: Lejano en muted

- **WHEN** la fecha límite está a más de 7 días
- **THEN** el badge muestra la fecha corta en color `muted` sin connotación de alarma

#### Scenario: Misma clasificación en todas las superficies

- **WHEN** una misma entidad se muestra en la agenda, el dashboard y su página de detalle
- **THEN** las tres superficies muestran el mismo nivel de urgencia y el mismo texto

### Requirement: Módulo "Vence pronto" en el dashboard

El dashboard SHALL mostrar, cuando exista al menos un deadline pendiente, un módulo compacto "Vence pronto" con hasta 3 entradas ordenadas por urgencia (vencidos primero, luego por fecha ascendente) y un acceso "Ver agenda →" a `/agenda`. Si el usuario no tiene ningún deadline pendiente, el módulo MUST NOT renderizarse.

#### Scenario: Dashboard con deadlines

- **WHEN** el usuario tiene cinco deadlines pendientes y abre el dashboard
- **THEN** el módulo muestra las 3 entradas más urgentes con su badge
- **AND** el link "Ver agenda →" navega a `/agenda`

#### Scenario: Dashboard sin deadlines

- **WHEN** el usuario no tiene ninguna entidad con fecha límite pendiente
- **THEN** el dashboard no muestra el módulo "Vence pronto"
- **AND** el resto del dashboard no cambia

### Requirement: Visibilidad de la fecha límite en listados y detalles

Las superficies existentes SHALL mostrar la fecha límite cuando la entidad la tenga: la biblioteca junto a los metadatos del ítem, el detalle del ítem en su encabezado o detalles, el listado de pasos como chip por paso, y el listado y detalle de proyectos. La obtención de estos datos MUST reutilizar las queries existentes (columna adicional en el select) sin introducir consultas N+1.

#### Scenario: Badge en la biblioteca

- **WHEN** la biblioteca lista un ítem con fecha límite próxima
- **THEN** la fila del ítem incluye el `<DeadlineBadge>` correspondiente
- **AND** los ítems sin fecha no muestran nada adicional

#### Scenario: Sin N+1

- **WHEN** la agenda o el dashboard arman sus entradas
- **THEN** los datos se obtienen con queries one-shot paralelas filtradas por `user_id` y se cruzan en memoria

### Requirement: Estética e idioma de la agenda

La UI de deadlines SHALL respetar el sistema de diseño existente: tokens de color del proyecto (incluido el nuevo `warning`), componentes compartidos (`<EmptyState>`, `<Button>`, `<DeadlineBadge>`), copy en español argentino y dark-only. La implementación MUST NOT agregar dependencias nuevas: el calendario y la línea de tiempo se construyen con `date-fns` y CSS, y los íconos provienen de `lucide-react`.

#### Scenario: Tokens y componentes

- **WHEN** se renderizan la agenda, el badge y el módulo del dashboard
- **THEN** se usan exclusivamente tokens del proyecto (`bg-surface`, `text-muted`, `text-accent`, `danger`, `warning`, etc.)
- **AND** no aparecen clases de color Tailwind crudas

#### Scenario: Copy en español argentino

- **WHEN** se redactan títulos, grupos, badges y empty states
- **THEN** la copy usa voseo y términos definidos ("Fecha límite", "Vence hoy", "Venció ayer", "Vence pronto", "Más adelante")
