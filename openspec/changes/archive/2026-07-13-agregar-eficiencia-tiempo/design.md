# Design: Eficiencia de tiempo (estimado vs. real)

## Context

La app ya captura todo el lado "real" de la ecuación: sesiones cronometradas con `duration_seconds`, progreso por unidades (`sessions.units_progressed` es un **delta** por sesión) y progreso por pasos (`session_steps.completed_in_session` marca qué pasos se completaron en cada sesión). Lo que falta es el lado "plan": cuánto tiempo *creías* que te iba a llevar cada cosa.

Estado actual relevante:

- `items` tiene `total_units`/`current_units` y opcionalmente pasos (`item_steps`, jerarquía módulo → tareas de un nivel, con `weight_pct`, `progress_mode`, `steps_weight_mode`). `src/lib/items/progress.ts` ya centraliza el cálculo de progreso 0..1.
- `projects` agrupa ítems N:M vía `project_items`.
- `/stats` es un Server Component que hace queries one-shot paralelas y delega gráficos a client components (`weekly-chart.tsx` con Recharts, `yearly-heatmap.tsx` con CSS).
- Deadlines ya sentó el precedente de "columna opcional en `projects` + `items` + `item_steps`" y de agregar un token de color (`--color-warning`).

Restricciones: dark-only, español argentino, tokens de color del proyecto, Server Components por defecto, sin dependencias nuevas, RLS + filtrado explícito por `user_id`.

## Goals / Non-Goals

**Goals:**

- Poder declarar un tiempo estimado opcional en proyecto, ítem, módulo y tarea, con el mínimo de fricción (un solo campo, nunca obligatorio).
- Una métrica única y entendible — el **índice de eficiencia** — que funcione igual para entidades terminadas y en curso.
- Visualización inmediata en el detalle del ítem y del proyecto: ¿voy más rápido o más lento que el plan?
- Sección "Eficiencia" en `/stats` con rango de fechas (presets + custom) para ver la tendencia general.
- Gráficas minimalistas estilo Apple: una idea por gráfico, jerarquía tipográfica clara, color con significado semántico, cero ruido.

**Non-Goals:**

- No se re-estiman ni versionan estimaciones (sin historial de cambios de estimación).
- No hay alertas/notificaciones por desvío de eficiencia (posible iteración futura).
- No se pide al usuario repartir manualmente el tiempo de una sesión entre pasos.
- No se agrega eficiencia a la biblioteca ni al dashboard (solo detalle de ítem, detalle de proyecto y stats).
- No se tocan los cálculos de progreso existentes (`progress.ts` queda intacto; eficiencia es una capa de lectura encima).

## Decisions

### D1 — Almacenamiento: `estimated_minutes integer` nullable en `items`, `item_steps` y `projects`

Una columna por tabla, `integer` en minutos, `null` por defecto, `CHECK (estimated_minutes > 0)`.

- **Por qué minutos y no segundos**: las estimaciones se piensan en horas/minutos; la precisión de segundos es ruido. Las sesiones siguen en segundos — la conversión vive en el cálculo.
- **Por qué columna y no tabla aparte**: misma decisión que `deadline` — es un atributo escalar opcional de la entidad, las políticas RLS existentes lo cubren sin trabajo extra.
- **Alternativa descartada**: tabla `estimates` con historial — complejidad sin caso de uso hoy (non-goal).

### D2 — Input UX: un componente compartido `EstimatedTimeInput` (horas + minutos)

Campo "Tiempo estimado (opcional)" con dos inputs numéricos compactos (`h` / `min`) que persisten un único `estimated_minutes`. Mismo componente en: nuevo ítem, editor de detalles del ítem, editor de pasos (versión compacta inline por paso) y formulario/detalle de proyecto.

- **Por qué h+m y no un solo input de minutos**: "2 h 30 min" es como la gente piensa; "150" no.
- **Alternativa descartada**: parser de texto libre ("2h 30m") — más mágico pero más frágil y peor en mobile.

### D3 — Estimación efectiva: cascada con derivación hacia arriba

```
efectiva(tarea)    = propia | null
efectiva(módulo)   = propia ?? sum(efectiva(tareas) que tengan)
efectiva(ítem)     = propia ?? sum(efectiva(módulos) que tengan)   // ítem sin pasos: solo propia
efectiva(proyecto) = propia ?? sum(efectiva(ítems miembros) que tengan)
```

- La estimación **propia siempre gana** (override explícito del usuario).
- La derivada se calcula solo con los hijos que tienen estimación; si ningún hijo tiene, no hay estimación efectiva.
- La UI marca las derivadas con el prefijo `≈` y un hint ("suma de 3 de 5 módulos") cuando la cobertura es parcial, para no vender una suma incompleta como total.
- **Alternativa descartada**: exigir que todos los hijos tengan estimación para derivar — bloquea el caso común de estimar incrementalmente.

Vive en `src/lib/efficiency/compute.ts` (funciones puras, sin I/O, espejo del patrón de `progress.ts`).

### D4 — Métrica: índice de eficiencia estilo earned-value

```
tiempo ganado = progreso (0..1) × estimación efectiva
índice        = tiempo ganado / tiempo real invertido
```

- Entidad **terminada** (progreso = 1): índice = `estimado / real` — exactamente la comparación que pidió el usuario.
- Entidad **en curso**: el índice ya es útil antes de terminar ("hice el 50 % del trabajo usando el 40 % del tiempo" → índice 1.25). Es el CPI de earned-value management, adaptado a tiempo.
- El progreso se toma del cálculo existente (`computeItemProgress`); para pasos hoja es binario (0 o 1), para módulos es fraccional según sus tareas.
- **Estados** (clasificación del índice `e`):
  - `e ≥ 1.10` → **Adelantado** (token `success`, nuevo)
  - `0.90 ≤ e < 1.10` → **En línea** (token `accent`)
  - `e < 0.90` → **Más lento** (token `warning`)
  - Overlay independiente: tiempo real > estimación efectiva **y** la entidad no está completada → **Estimación superada** (token `danger`), porque ahí ya no es "vas lento", es "el plan quedó corto".
- Guardas: sin estimación efectiva → no hay índice (la UI invita a estimar); con estimación pero sin tiempo o sin progreso registrado → "Sin datos todavía" (evita índices infinitos o 0 engañosos).
- **Alternativa descartada**: mostrar solo `real / estimado` (consumo) — no distingue "usé la mitad del tiempo porque voy rápido" de "usé la mitad del tiempo pero no avancé nada".

### D5 — Atribución de tiempo real por paso: reparto igualitario

El `duration_seconds` de una sesión se reparte en partes iguales entre los N pasos asociados vía `session_steps` (`duration / N` a cada uno). Sesiones sin pasos asociados suman al ítem pero a ningún paso.

- **Por qué**: conserva el total (la suma por pasos = duración de la sesión, nunca se duplica tiempo), es determinista y no agrega fricción de UI.
- **Alternativas descartadas**: ponderar por `weight_pct` (los pesos modelan progreso, no tiempo — un módulo pesado puede ser rápido); pedir reparto manual al cerrar sesión (fricción directa contra el flujo de guardado, que ya está optimizado para ser instantáneo).
- Trade-off asumido: una sesión que mezcló 3 tareas reparte tiempo aunque el 90 % se haya ido en una — inexactitud aceptada y documentada; a nivel módulo/ítem el error se diluye.

### D6 — Tiempo ganado por sesión (para la serie temporal de `/stats`)

Cada sesión aporta a la serie del período:

- **Tiempo invertido** = `duration_seconds`.
- **Tiempo ganado** =
  - ítem por unidades: `(units_progressed / total_units) × efectiva(ítem)`
  - ítem por pasos: `sum(contribución al progreso del ítem de cada paso con completed_in_session = true) × efectiva(ítem)` — la contribución reusa la misma matemática de `progress.ts` (share del módulo según `steps_weight_mode`, share de la tarea según `progress_mode` del módulo).
- Las sesiones de ítems **sin estimación efectiva quedan fuera de ambas series** (comparar invertido-sin-plan contra ganado-cero sesgaría el índice). La sección muestra la cobertura ("X h del período sin estimación") para que el dato sea honesto.
- Sin clamp por sesión: si el usuario registra más unidades que el total, el progreso del ítem ya clampa a 1 en las vistas de entidad; en la serie del período se acepta el valor crudo (transparencia sobre el registro real).

### D7 — Rango de fechas en `/stats` vía search params

`/stats?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`. El Server Component lee `searchParams`, filtra las sesiones del rango y computa todo server-side (mismo patrón RSC del resto de la página). El selector es un client component chico: presets como links (`7 días`, `30 días`, `90 días`, `Este año`, `Todo`) + dos `<input type="date">` para el rango custom que hacen `router.replace`. Default sin params: **últimos 30 días**.

- El bucketing diario usa la `timezone` del perfil (ya se trae en la página) con `toLocaleDateString('en-CA', { timeZone })` — mismo enfoque que el resto de stats.
- **Alternativa descartada**: estado client-side con refetch — rompe el patrón RSC de la página y duplica queries.

### D8 — Visualizaciones

Tres piezas, cada una con un solo mensaje:

1. **`<EfficiencyBullet>`** (compartido, `src/components/efficiency-bullet.tsx`, CSS/SVG sin Recharts): barra horizontal donde el track representa la estimación efectiva y el fill el tiempo real; si el real supera el estimado, el excedente se dibuja en `danger` suave pasando el marcador. Acompañada del índice grande legible ("25 % más rápido que lo estimado") y el chip de estado. Se usa en detalle de ítem, detalle de proyecto y filas de desglose.
2. **Evolución del período** (`/stats`, client component con Recharts `AreaChart`): dos series acumuladas día a día — *Invertido* (neutro, `muted`) y *Ganado* (`accent`) — con tooltip en español y ejes mínimos. Si la curva ganada va por encima de la invertida, vas adelantado; el cruce es visible de un vistazo.
3. **Desglose por entidad**: en el proyecto, una fila por ítem miembro con su mini bullet; en `/stats`, una fila por ítem completado dentro del período con estimado, real y delta legible ("terminado 2 h 15 m antes de lo estimado"). Listas con CSS puro, sin librerías.

Colores siempre vía tokens (`var(--color-success)`, etc.); los estados llevan texto además de color (no se comunica solo con color).

### D9 — Token `--color-success`

Se agrega en `globals.css` junto a los existentes (verde apagado coherente con la paleta dark, p. ej. `#4ade80` ajustado a la saturación de la paleta actual). Deadlines ya hizo lo mismo con `--color-warning`; "ir adelantado" necesita un verde semántico que hoy no existe.

### D10 — Queries sin N+1

- **Detalle del ítem**: + una query de sesiones del ítem (`id, duration_seconds, units_progressed`) y una de `session_steps` de esas sesiones; agregación en memoria.
- **Detalle del proyecto**: + una query de sesiones de los ítems miembros (filtrada por `item_id in (...)`) — el detalle ya conoce los ítems.
- **`/stats`**: + una query de sesiones del rango con join a `items` (incluyendo `estimated_minutes`, `total_units`, `steps_weight_mode`), una de `session_steps` de esas sesiones y una de `item_steps` de los ítems involucrados.

Todo filtrado por `user_id` (defensa en capas además de RLS), siguiendo el patrón existente de la página de stats.

## Risks / Trade-offs

- **[Reparto igualitario impreciso por paso]** → Asumido por diseño (D5); el total siempre se conserva y la imprecisión se diluye en niveles agregados. Documentado en la UI con lenguaje aproximado ("≈").
- **[Estimaciones derivadas parciales]** → Se marcan con `≈` + hint de cobertura; nunca se presentan como totales exactos.
- **[Índice volátil al arrancar]** (5 min invertidos y una tarea hecha → índice absurdo) → Guarda "Sin datos todavía" exige progreso > 0 **y** tiempo > 0; además el copy presenta el índice como tendencia, no como veredicto.
- **[units_progressed inflado por el usuario]** → El progreso de entidad clampa a 1; en la serie del período se acepta el crudo (D6). Riesgo bajo: app personal, sin incentivos para inflar.
- **[Sesiones históricas sin session_steps]** → La migración de item-steps ya pobló `session_steps` desde `sessions.step_id`; las sesiones sin paso simplemente no atribuyen tiempo a pasos (comportamiento correcto).
- **[Crecimiento de la query de stats con años de datos]** → El rango por defecto es 30 días; "Todo" puede crecer, pero es una app single-user con volumen acotado. Si algún día duele, se materializa una vista tipo `daily_minutes` con earned incluido.

## Migration Plan

1. Migración SQL aditiva (Supabase): `ALTER TABLE items ADD COLUMN estimated_minutes integer CHECK (estimated_minutes > 0); ALTER TABLE item_steps ADD COLUMN estimated_minutes integer CHECK (estimated_minutes > 0); ALTER TABLE projects ADD COLUMN estimated_minutes integer CHECK (estimated_minutes > 0);` — sin backfill, sin lock relevante (columnas nullable).
2. Deploy del código (schemas, actions, UI). Las entidades sin estimación no muestran nada nuevo salvo el CTA de estimar.
3. Rollback: revertir el deploy; las columnas pueden quedar (inofensivas) o droppearse con `ALTER TABLE ... DROP COLUMN`.

## Open Questions

- Umbrales de estados (±10 %) — arrancan hardcodeados en `compute.ts`; si en el uso real resultan ruidosos, se ajustan ahí (un solo lugar).
- Tono exacto del verde `--color-success` — se define en implementación contrastándolo contra `bg-surface` (criterio: legible pero no neón en dark).
