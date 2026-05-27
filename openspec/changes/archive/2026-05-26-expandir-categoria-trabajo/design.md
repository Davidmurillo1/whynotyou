## Context

El MVP de "Why Not You?" está fuertemente cableado al caso de uso "estudio": vocabulario, copy ("Una sola cosa basta", "días con estudio"), unidades (páginas / videos / módulos / capítulos / horas / %) y rituales (heatmap anual, racha). El motor real es genérico: cronómetro + unidades acumuladas hacia un total. Eso mismo sirve para describir un proyecto de trabajo, pero hoy:
- Mezclar "leer un libro" y "armar un informe para un cliente" en la misma lista distorsiona las stats — la racha se sostiene igual con cualquiera de los dos, pero el usuario quiere saber cuántas horas dedicó **a estudiar** y cuántas **a trabajar**.
- Las unidades existentes no calzan con trabajo: la mayoría de los proyectos no tienen 80 "páginas" o 12 "módulos"; tienen hitos heterogéneos (investigar, redactar, revisar, entregar) cuyo peso es desigual.

A la vez, el flujo actual ya tiene piezas reutilizables que conviene **no romper**:
- `unit_type = 'percent'` ya existe y permite avanzar de 0 a 100 con `units_progressed` decimal — usable como fallback para ítems de trabajo sin pasos definidos.
- Categorías (con anidación de 1 nivel) ya agrupan ítems transversalmente y sobreviven al cambio.
- `current_units / total_units` es el modelo de progreso en todas las vistas (`ProgressRing`, listas, dashboard, detalle). Tocarlo central afecta UI en cascada.

Este cambio agrega **dos ejes ortogonales**:
1. **`scope`** (estudio vs trabajo) — atributo del ítem que cambia agrupación, filtros y agregados en stats. No cambia el motor de progreso.
2. **Pasos (`item_steps`)** — descomposición opcional del ítem. Cuando existen, el progreso del ítem se computa desde los pasos completados (suma de pesos). Cuando no, el ítem sigue con el modelo de unidades intacto.

Mantener ambos ejes desacoplados es importante: un ítem de trabajo puede no tener pasos (proyecto continuo) y un ítem de estudio sí puede tenerlos (curso con módulos heterogéneos). El usuario decide caso por caso.

## Goals / Non-Goals

**Goals:**
- Que el producto siga siendo usable como "tracker de estudio" sin cambios visibles para quien no quiera tocar nada.
- Permitir clasificar un ítem como `study` o `work` en la creación, y cambiarlo después si el usuario se equivocó.
- Permitir descomponer cualquier ítem en pasos con peso porcentual, con UI para marcar/desmarcar y reordenar.
- Stats que muestren **simultáneamente y comparables** estudio vs trabajo: totales, semanal, breakdown por categoría.
- Que el dashboard "Hoy" siga teniendo una propuesta clara cuando hay ítems de ambos scopes.
- Migración sin fricción: ítems existentes adoptan `scope = 'study'` automáticamente.

**Non-Goals:**
- No se introduce un modelo recursivo de pasos sin límite. Los pasos admiten **1 solo nivel** de anidación: módulos (paso raíz) → tareas (hijos). Las tareas no pueden tener sub-tareas. Esto coincide con el modelo de categorías ya existente.
- No se reescribe el sistema de unidades; los pasos **conviven** con `current_units / total_units`, no lo reemplazan en el schema.
- No se agrega Pomodoro, deadlines, asignación a otras personas, ni colaboración multi-usuario. Sigue siendo single-user.
- No se cambia el modelo de racha. La racha sigue contando "días con cualquier sesión" — no se desdobla en racha de estudio y racha de trabajo (al menos en este change).
- No se introduce theme switcher, internacionalización ni cambios de marca.
- No hay export de datos en este change.

## Decisions

### Decisión 1: `scope` como columna en `items`, no como tipo nuevo (`kind`)

Podríamos haber agregado un valor más a `kind` (por ejemplo `work_project`), pero eso mezcla dos conceptos: **qué tipo de cosa es** (libro, curso, podcast…) y **para qué la estás haciendo** (estudiar o trabajar). Un proyecto de trabajo puede ser perfectamente "documentación" o "serie de artículos". Por eso `scope` va como columna aparte.

**Alternativas consideradas:**
- *Categoría especial "Trabajo"*: el usuario podría crear una categoría llamada Trabajo y agrupar ahí. Lo descartamos porque (a) las categorías son del usuario y no estructurales, no se puede confiar en su existencia, (b) hay categorías que cruzan scope (e.g. "Diseño" puede tener un libro y un proyecto de cliente), y (c) en stats queremos un eje primario, no derivado de un opcional.
- *Tabla `projects` separada*: duplicaría todo el aparato de items/sesiones por una distinción pequeña. La fricción de mantenimiento sería alta.

### Decisión 2: Pasos como tabla `item_steps` con peso `numeric(6,2)` 0–100, pesos relativos

El peso se guarda como `numeric(6,2)`, lo que admite decimales (`33.33`, `12.5`, etc.). En la versión original probé con entero pero quedó claro que los usuarios necesitan precisión: cuando descomponés un módulo en 3 partes iguales, "33%" no encaja en 100 mientras que "33.33%" sí.

**Modelo de pesos**: cada paso tiene un `weight_pct` entero entre 1 y 100. La suma **no** está obligada a cerrar 100. El progreso del ítem se calcula como `sum(weight where done) / sum(all weight)` — pesos **relativos**.

**Por qué relativos y no estrictos** (revisión post-implementación): la versión inicial obligaba a que la suma cerrara 100, validado por trigger Postgres `DEFERRABLE INITIALLY DEFERRED`. Esto falló en el uso real porque cada `createStepAction` desde el cliente abre su propia transacción HTTP a Supabase — el trigger deferred solo amortigua dentro de **una** transacción, no entre varios inserts incrementales del usuario. Resultado observado: el usuario solo podía crear el primer paso con peso=100, sin posibilidad de agregar más después. Decisión: aflojar a pesos relativos.

**Alternativas consideradas:**
- *Peso entero*: simpler pero no permite repartir 100 entre 3 partes iguales. Se descartó tras feedback de uso real.
- *Suma = 100 obligatoria (modelo original)*: rota en la práctica por el problema de transacciones por insert (ver arriba). Hubiera requerido un editor en "modo draft" con commit explícito, lo cual contradice el flujo incremental del producto.
- *Pasos sin peso*: cada paso vale lo mismo. Sirve para listas uniformes pero rompe el caso de uso ("investigar es 40%, redactar es 60%"). Cubrimos este caso con `progress_mode = 'count'` (ver Decisión 9c) en vez de eliminar el peso.

### Decisión 9c (post-MVP): Modo de cálculo por módulo (`progress_mode`)

Tras usar el producto el usuario quería dos formas de calcular el progreso de un módulo:
- **`weighted`** (default): suma ponderada por `weight_pct` de cada tarea. Aporta la flexibilidad de "esta tarea pesa más que esa". Es el modelo actual.
- **`count`**: igualitario. Progreso = `done_children / total_children`. Útil cuando todas las tareas son comparables y no querés andar pensando en porcentajes individuales.

Se agrega columna `item_steps.progress_mode text default 'weighted' check (in 'weighted','count')`. Solo afecta cómo se calcula el progreso de un módulo a partir de sus hijos — se ignora para hojas y para módulos sin hijos.

**UI**: cuando un módulo tiene tareas, aparece un toggle "Por peso / Por cantidad" justo arriba de la lista. En modo `count`, los inputs de peso individuales se ocultan (el peso interno se preserva en DB, pero no se muestra para no distraer al usuario).

**Alternativas consideradas:**
- *Setting global por ítem*: menos flexible — un mismo proyecto puede tener un módulo "Tareas iguales" (mode=count) y otro "Tareas con peso variable" (mode=weighted).
- *Eliminar el `weight_pct` de tareas en modo count*: rompe el toggle reversible (al volver a weighted perderías los valores). Lo mantenemos como dato latente.

### Decisión 3: Cuando hay pasos, el progreso del ítem se computa **desde** los pasos; cuando no, sigue con unidades

Concretamente, `progress_pct` se deriva así (lógica en la app, no en DB):
- Si el ítem tiene pasos: `progress_pct = sum(weight_pct where is_done) / sum(weight_pct)` (pesos relativos).
- Si no tiene pasos: `progress_pct = current_units / total_units` (modelo actual).

Las sesiones siguen registrando `units_progressed` igual que hoy. Cuando se marca un paso como done dentro de una sesión, **además** se suma el peso del paso a `current_units` solo si `unit_type = 'percent'` — así el modelo "%" se mantiene coherente con los pasos. Para otros `unit_type` (páginas, capítulos, etc.) `current_units` lo administra el usuario manualmente como hoy, y los pasos son un eje paralelo de progreso (la UI usa el cálculo desde pasos).

**Alternativas consideradas:**
- *Forzar `unit_type = 'percent'` cuando hay pasos*: simplifica pero quita flexibilidad (un libro con capítulos puede querer pasos por sección además).
- *Doble barra de progreso*: agrega ruido visual y no se entiende qué mira el usuario. Mejor un único `ProgressRing` cuya semántica cambia según presencia de pasos.

### Decisión 4: `scope` por defecto `'study'` en DB con default + valor en `createItemAction`

Los ítems existentes quedan en `study` por defecto (preserva comportamiento). La server action lo recibe en formData y lo valida con Zod (`z.enum(['study','work'])`). Si no llega, default `'study'`.

### Decisión 5: Vista `daily_minutes` extendida con `minutes_study` y `minutes_work`

Hoy la página `/stats` lee de `daily_minutes` (vista que ya existe en Supabase). En vez de hacer dos consultas paralelas filtradas por scope desde el cliente —que romperíamos el contrato de la vista—, **extendemos** la vista para devolver tres campos: `minutes` (total), `minutes_study`, `minutes_work`. Eso permite renderizar el split sin queries adicionales y mantiene un único punto donde se define la agregación diaria.

Para `category-breakdown`, se agrega un parámetro de scope (o se envían dos consultas paralelas filtradas por `items.scope`). Decisión concreta: dos consultas paralelas en el server component — más simple que reescribir la vista en este iteración.

**Alternativas consideradas:**
- *Calcular el split en cliente desde sessions crudas*: posible pero pierde el beneficio de la vista (agregación pre-calculada).
- *Materialized view*: prematuro para un MVP single-user.

### Decisión 6: Heatmap anual queda **global** (no split por scope)

El heatmap es una narrativa visual de constancia ("seguís el ritual"). Partirlo en dos cuadrículas duplica el componente, ocupa más vertical y no agrega información que el split numérico ya no esté dando arriba. Sí se pueden colorear las celdas con un degradado que represente la **mezcla** (más caliente = más minutos totales; saturación o tinte que indique predominio de estudio vs trabajo), pero eso es enhancement post-MVP de este change.

En este change: heatmap sigue siendo total. Las stats numéricas (totales, semanal, por categoría) sí se splittean.

### Decisión 7: Copy adaptativo, no toggle de "modo"

No agregamos un toggle global "estoy en modo trabajo". Sería confuso y crearía dos productos en uno. En lugar de eso, los textos del greeting y de empty states **detectan** si hay ítems de trabajo activos y adaptan la voz suavemente. Si solo hay ítems de estudio, el copy queda exactamente como hoy. Si hay solo trabajo o ambos, la voz incluye "lo que estás haciendo / lo que tenés entre manos" en lugar de "lo que estás aprendiendo".

### Decisión 8: Filtro de scope en biblioteca con tres estados: Todo / Estudio / Trabajo

Tabs simples arriba de la lista. El default es "Todo" para no esconder ítems al usuario. La preferencia no se persiste — es una elección por sesión de browsing, no un setting.

### Decisión 9b (post-MVP): Pasos jerárquicos con 1 nivel de anidación

Tras usar el producto real, quedó claro que un solo nivel de lista era insuficiente: en un proyecto de trabajo el usuario quiere descomponer cada módulo (Levantar Requerimientos, Desarrollar Software, etc.) en tareas concretas. Se agrega un nivel de jerarquía:
- Un paso con `parent_step_id = null` es un **módulo** (paso raíz).
- Un paso con `parent_step_id` apuntando a un módulo es una **tarea** hija.
- No se permite anidar tareas dentro de tareas (trigger DB `check_step_parent_depth` lo rechaza).

**Cálculo de progreso jerárquico:**
- Si un módulo no tiene hijos, su progreso es 0 o 1 según su propio `is_done`.
- Si tiene hijos, su progreso es fraccional: `sum(child.weight WHERE child.is_done) / sum(child.weight)`. El `is_done` del módulo se ignora (estado derivado).
- El progreso del ítem es la suma ponderada de los módulos: `sum(root.weight * progress(root)) / sum(root.weight)`.

**Ejemplo**: módulo "Desarrollar Software" pesa 40 del total; tiene 4 tareas con pesos iguales y 2 hechas → módulo al 50% → aporta 20 al total ponderado.

**Cuando un módulo tiene tareas, su checkbox manual queda deshabilitado** para evitar doble fuente de verdad. La server action `toggleStepAction` también lo rechaza si detecta hijos.

**Alternativas consideradas:**
- *Recursividad sin límite*: poder, sí; pero abre la puerta a árboles de 5 niveles que rompen UX. Una capa basta para el caso de uso real.
- *Tablas separadas `modules` y `tasks`*: dos esquemas para el mismo concepto. Una tabla con `parent_step_id` es más simple.
- *Marcar módulo manual además de tareas*: confunde al usuario. La regla "si tiene tareas, el padre es derivado" es predecible.

### Decisión 9 (post-MVP): Edición libre de atributos del ítem

El producto inicial dejaba inmutables `title`, `kind`, `unit_type`, `total_units` y `source_url` después de crear el ítem. En el uso real para trabajo esto se demostró restrictivo: un proyecto cambia, el alcance se ajusta, "12 módulos" pasan a ser 15. Se agrega `updateItemFieldsAction` y un componente `<ItemDetailsEditor>` accesible desde el detalle del ítem.

**Salvaguarda**: al bajar `total_units` por debajo de `current_units` (no rompe pasos), el server action recorta `current_units` para evitar progresos > 100%.

## Risks / Trade-offs

- **Riesgo (resuelto)**: Trigger Postgres de validación de suma = 100 fallaba con inserts incrementales del usuario (cada server action es su propia transacción HTTP). **Resolución**: se eliminó el trigger y se migró a pesos relativos. El check de columna `weight_pct between 1 and 100` se mantiene como guarda mínima.

- **Riesgo**: La fórmula de progreso depende de si hay pasos, lo cual es una bifurcación implícita. Si en algún punto el usuario crea pasos pero luego los borra todos, el progreso "vuelve" al modelo de unidades — eso puede confundir. **Mitigación**: la UI debe mostrar visiblemente qué modelo está en uso ("Progreso por pasos" vs "Progreso por unidades"). Y un ítem con pasos no permite borrar todos los pasos sin confirmación explícita.

- **Trade-off**: Permitir `scope = 'work'` sin pasos significa que un usuario puede tener un proyecto de trabajo modelado solo con `unit_type = 'hours'` y total_units = 40h. Eso es deliberado: no todos los proyectos se descomponen bien. La opción de pasos queda como **enhancement** del ítem, no requisito.

- **Trade-off**: Calcular `minutes_study` / `minutes_work` requiere join con `items` en la vista. Costo: el join es por `user_id` (con índice) y la vista ya hacía un join similar — no debería degradar performance en datasets personales.

- **Limitación conocida**: La racha sigue siendo única (estudio + trabajo se cuentan juntos para mantenerla). Si el usuario quiere ver "racha de estudio" separada en el futuro, requiere otro change. Documentar en stats que la racha es global.

## Migration Plan

1. **Migración de schema (Supabase)**:
   - Agregar columna `scope` a `items` con default `'study'` y check constraint. Sin backfill necesario (default).
   - Crear tabla `item_steps` con sus columnas, RLS por `user_id`, índice `(item_id, position)`.
   - Agregar columna `step_id` a `sessions` (nullable, ON DELETE SET NULL).
   - Reescribir vista `daily_minutes` para incluir `minutes_study` y `minutes_work` (`DROP VIEW … CASCADE` + recreate; nada más depende de la vista en el proyecto).
   - Crear trigger sobre `item_steps` que valida suma de `weight_pct` = 100 cuando hay al menos un paso para el `item_id`.

2. **Despliegue**:
   - Aplicar la migración antes de mergear el frontend nuevo. Como `scope` tiene default y `item_steps` arranca vacío, no hay riesgo de inconsistencia entre frontend viejo y schema nuevo (el frontend viejo simplemente ignora los nuevos campos).
   - El frontend nuevo es compatible con datos viejos: ítems sin scope (no debería pasar por el default) y sin pasos siguen funcionando.

3. **Rollback**:
   - Frontend: revert del commit del change → la app vuelve a no enseñar scope ni pasos, pero las columnas en DB quedan (inertes). No hay pérdida de datos.
   - DB: si hace falta rollback de schema, `item_steps` puede quedar (es opcional). `items.scope` se puede dejar; el frontend viejo lo ignora. Solo si hay corrupción real, `DROP COLUMN scope` y `DROP TABLE item_steps` revierten.

4. **Sin downtime**: el plan es backward-compatible en cada paso intermedio.
