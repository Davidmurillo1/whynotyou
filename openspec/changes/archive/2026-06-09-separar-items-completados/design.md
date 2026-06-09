## Context

El **dashboard** trae ítems con `.eq('status', 'active')`, pero ese filtro no captura ítems al 100% cuyo `status` nunca fue actualizado a `'done'` (caso real: un ítem con `status = 'active'` y 9/9 módulos terminados aparece como "en curso"). Falta filtrar también por progreso calculado.

La **Biblioteca** tiene dos problemas:
1. Agrupa todos los estados con igual peso visual; los ítems "completados" y "abandonados" hacen ruido al lado de los activos.
2. Calcula el porcentaje como `current_units / total_units`, pero para ítems con pasos eso suele ser 0 — el progreso real vive en `item_steps` y se computa con `computeItemProgress`. Resultado: el porcentaje aparece como 0% para muchos ítems.

Restricciones relevantes:
- El proyecto usa **Server Components por defecto**. La navegación entre vistas tiene que funcionar sin `useState`.
- Los tokens de color del proyecto (`text-muted`, `bg-surface`, `border-border`, `bg-accent`, etc.) deben usarse.
- Patrón existente: el filtro por scope ya usa search params (`?scope=...`). El nuevo filtro debe seguir la misma estrategia.

## Goals / Non-Goals

**Goals:**
- Dashboard: filtrar ítems al 100% aunque su `status` no esté sincronizado.
- Biblioteca: separar "En curso" de "Completados" con tabs reales (no apilado vertical).
- Biblioteca: usar `computeItemProgress` con `item_steps` para el porcentaje, igual que el dashboard.
- Mantener Server Component puro — navegación vía search params, sin `"use client"`.

**Non-Goals:**
- Auto-marcar el `status` de un ítem como `'done'` cuando llega al 100% (cambio de datos, fuera de scope).
- Edición masiva, archivar manualmente, o restaurar ítems desde la Biblioteca.
- Cambiar el diseño del dashboard más allá del filtro de progreso.

## Decisions

### Decisión 1 — Definir "completado" como propiedad derivada

Un ítem es "completado" si `status === 'done'` **OR** `computeItemProgress >= 1`. Esta regla unifica el comportamiento del dashboard ("no mostrar lo terminado") y de la Biblioteca ("clasificar como completado").

Casos cubiertos:
- `status = 'done'` → completado (independiente del progreso).
- `status = 'active'`, progreso 100% → completado (el caso del bug reportado).
- `status = 'abandoned'`, progreso < 100% → abandonado (sub-categoría dentro de la vista "Completados").
- `status = 'abandoned'`, progreso 100% → completado (gana el progreso real).

**Alternativa descartada**: tratar solo el `status` como fuente de verdad y forzar al usuario a marcar manualmente como "Terminado" — agrega fricción y no resuelve el bug reportado.

### Decisión 2 — Tabs con search params para alternar vistas

La vista activa se controla con `?view=current|done` (default `current`). Cada tab es un `<Link>` que regenera la URL preservando otros filtros (scope). Esto:
- Mantiene Server Component puro (sin `useState`).
- Permite compartir/guardar URLs específicas.
- Replica el patrón ya usado para `?scope=...`.

**Alternativa descartada: client component con `useState`** — más complejo, rompe la URL como fuente de verdad y obliga a marcar la página como `"use client"`.

**Alternativa descartada: secciones apiladas con divisor + opacidad** (intento anterior) — al usuario le costó distinguir lo "en curso" de lo "completado" porque ambos seguían visibles juntos. Los tabs separan visualmente sin pedir scroll ni interpretación.

### Decisión 3 — Tabs con badge numérico

Cada tab muestra su conteo en un badge (`En curso 5` / `Completados 3`). El conteo se calcula sobre todos los ítems del scope actual, así el usuario sabe cuántos ítems hay del otro lado sin tener que cambiar de tab.

**Alternativa descartada**: tabs sin contador — funciona pero es menos informativo; el costo es mínimo.

### Decisión 4 — Sub-secciones por status dentro de cada vista

Dentro de cada vista, los ítems se siguen agrupando por `status` (Activo/Pausado en "En curso"; Completado/Abandonado en "Completados"). Esto preserva la información de estado sin volverla la dimensión principal de navegación.

### Decisión 5 — Biblioteca usa `computeItemProgress` con `item_steps`

Se fetchea `item_steps` para todos los ítems listados (single query, igual que el dashboard) y se computa el progreso server-side. El cálculo es idéntico al del dashboard, garantizando consistencia visual entre ambas vistas.

**Alternativa descartada**: calcular `current_units / total_units` con un fallback — produce 0% para ítems con pasos, justamente el bug reportado.

## Risks / Trade-offs

- **Query extra para `item_steps`**: aumenta el costo de la página Biblioteca con N ítems. Mitigación: la query es batched (`.in('item_id', ids)`) y respeta el filtro RLS por `user_id`.
- **Inconsistencia entre `status` y progreso real**: un ítem al 100% con `status = 'active'` sigue siendo "active" en la base de datos. El UI lo trata como completado en ambas vistas, pero las acciones que dependen del `status` (e.g., flujos de "marcar como terminado") siguen viendo el status original. Mitigación: documentado en el spec; futura iteración podría auto-actualizar el status.
- **Cambio de tab vs filtro de scope**: hay dos navs (view + scope), lo que puede percibirse como mucha UI. Mitigación: el nav de view es la dimensión primaria (borde inferior + badge), y el de scope es secundario (pills compactos), creando jerarquía visual clara.
