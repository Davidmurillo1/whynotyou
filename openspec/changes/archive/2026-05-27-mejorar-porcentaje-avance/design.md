## Context

El módulo de "pasos" (`item_steps`) hoy guarda un `weight_pct` por paso y lo trata como **peso relativo**: el progreso es `sum(weight_pct WHERE done) / sum(weight_pct)`. No se exige que sumen 100. La UI muestra el sufijo `%` junto al input numérico, lo que hace creer al usuario que está escribiendo porcentajes absolutos.

Resultado visible: cuatro módulos con valor `1` cada uno se muestran como "25% del peso total". Matemáticamente coherente (1/4), pero conceptualmente engañoso. El historial del spec (`openspec/specs/item-steps/spec.md`, requisito "Pesos relativos sin obligación de cerrar 100") incluso documenta que en su día existió un trigger `check_steps_sum_pct` exigiendo suma=100 y fue removido porque bloqueaba inserciones incrementales.

Este change resuelve esa ambigüedad ofreciendo dos modos explícitos al usuario, sin reintroducir el trigger.

## Goals / Non-Goals

**Goals:**
- Que el usuario decida explícitamente cómo se reparte el peso entre módulos.
- Que el modo `'equal'` ofrezca una experiencia "sin pensar" para el 90% de los ítems: el usuario solo crea módulos, no toca números.
- Que el modo `'custom'` permita pesos heterogéneos con feedback visual de la suma, **sin** bloquear ediciones intermedias.
- Preservar compatibilidad con datos existentes: nada se borra ni reinterpreta sin consentimiento del usuario.
- Mantener el contrato actual del cálculo de progreso a nivel de `computeItemProgress`: las vistas que lo consumen (heatmap, weekly chart, dashboard) no deberían cambiar.

**Non-Goals:**
- Introducir validación dura "suma = 100" como condición de guardado (rechazado explícitamente — la lección histórica del trigger removido aplica).
- Cambiar el comportamiento de las **tareas** dentro de un módulo: el `progress_mode` (`'weighted'` / `'count'`) ya cubre ese eje. No se agrega un `weight_mode` a nivel de módulo individual.
- Persistir el `weight_mode` por usuario o como preferencia global. Es por ítem.
- Implementar "deshacer" para la acción "Normalizar a 100".
- Localización: la app es solo español argentino.

## Decisions

### Decision 1: `weight_mode` vive en `items`, no en `item_steps`

`steps_weight_mode` es un atributo del ítem (de la colección de pasos como un todo), no de un paso individual. Eso evita estados inconsistentes (¿qué pasa si dos módulos del mismo ítem dicen modos distintos?).

**Alternativa considerada:** un campo en cada `item_steps` raíz. Rechazada porque crearía la posibilidad de inconsistencia y duplicaría la fuente de verdad.

### Decision 2: Default `'equal'` para ítems nuevos, `'custom'` para ítems existentes

Los usuarios que ya estaban viendo "25% del peso total" para 4 módulos de peso 1 deben seguir viendo ese 25% después de la migración. Por eso los ítems con pasos preexistentes quedan en `'custom'`. Los ítems nuevos arrancan en `'equal'` porque es el comportamiento más predecible y el que esperamos sea más común.

**Alternativa considerada:** poner todo en `'equal'` y reescalar los pesos automáticamente al primer cambio. Rechazada por ser invasiva sobre datos del usuario.

**Implementación de la migración:**

```sql
ALTER TABLE items
  ADD COLUMN steps_weight_mode text NOT NULL DEFAULT 'equal'
  CHECK (steps_weight_mode IN ('equal', 'custom'));

-- Marcar como 'custom' a los ítems que YA tienen pasos al momento de la migración
UPDATE items
SET steps_weight_mode = 'custom'
WHERE id IN (SELECT DISTINCT item_id FROM item_steps);
```

Eso es seguro porque el `DEFAULT 'equal'` se aplica solo a nuevos inserts.

### Decision 3: `weight_pct` se preserva siempre — el modo no destruye datos

Cambiar de `'custom'` a `'equal'` **no** resetea `weight_pct`. Cambiar de vuelta lo restituye. Esto desacopla el modo (configuración) del dato (peso) y le da al usuario una forma de "probar" el modo sin perder su trabajo.

### Decision 4: Validación de suma 100 es señal visual, no bloqueo

La regla "suma = 100 en modo `'custom'`" se implementa como:
1. **Indicador en vivo** debajo del listado de módulos: "Suma: 87 / 100" (color de advertencia si ≠ 100, color normal si = 100).
2. **Banner persistente** en el header del ítem cuando ≠ 100: "Tu progreso usa pesos que no suman 100 — el cálculo es proporcional".
3. **Botón opcional** "Normalizar a 100" que el usuario invoca cuando quiere. No es modal ni obligatorio.

**Lo que NO hacemos:**
- No rechazar `createStepAction` / `updateStepAction` por suma incorrecta.
- No mostrar un modal "tienes que arreglar los pesos" al abrir el ítem.
- No bloquear el cambio de modo de `'equal'` a `'custom'` si la suma actual ≠ 100.

Esto evita el modo de fallo del trigger histórico.

### Decision 5: `computeItemProgress` ramifica internamente; las consumers no cambian

```ts
export function computeItemProgress(
  item: ItemProgressInput & { steps_weight_mode?: 'equal' | 'custom' },
  steps?: StepLike[] | null,
): number {
  if (steps && steps.length > 0) {
    const roots = steps.filter((s) => !s.parent_step_id)
    if (roots.length === 0) return 0
    const mode = item.steps_weight_mode ?? 'equal'

    if (mode === 'equal') {
      // Todos los módulos pesan 1/n
      const sum = roots.reduce((acc, r) => acc + computeStepProgress(r, steps), 0)
      return clamp01(sum / roots.length)
    }

    // mode === 'custom' — lógica actual
    const totalWeight = roots.reduce((acc, r) => acc + Number(r.weight_pct), 0)
    if (totalWeight <= 0) return 0
    const accum = roots.reduce(
      (acc, r) => acc + Number(r.weight_pct) * computeStepProgress(r, steps),
      0,
    )
    return clamp01(accum / totalWeight)
  }
  // ... resto sin cambios
}
```

El cambio es estrictamente aditivo en la firma — `steps_weight_mode` viene como opcional sobre `ItemProgressInput`. Donde no esté disponible (rare path), default a `'equal'` para no replicar el comportamiento engañoso de la versión anterior.

**Riesgo:** consumers que construyen `ItemProgressInput` "a mano" sin pasar el modo. Mitigación: hacer un grep por `computeItemProgress(` y verificar cada call site.

### Decision 6: Server action dedicada `setStepsWeightModeAction`

```ts
export async function setStepsWeightModeAction(input: {
  item_id: string
  mode: 'equal' | 'custom'
}): Promise<{ ok: true } | { error: string }>
```

No reusamos `updateItemAction` porque:
- Es una acción específica y aislada (cambio de modo).
- Permite hacer `revalidatePath('/item/:id')` puntual sin tocar otros caches.
- La UI puede llamarla directo desde el toggle sin construir un form completo.

### Decision 7: Mantener `weight_pct` con su rango (0.01 .. 100) en Zod

No bajamos el límite inferior ni quitamos el upper bound. La razón: en modo `'custom'` un usuario sí puede querer asignar peso 100 a un único módulo crítico ("el resto suma 0 pero ese vale el ítem completo"). Y en modo `'equal'` el valor de `weight_pct` simplemente se ignora, así que cualquier valor positivo sirve.

### Decision 8: Acción "Normalizar a 100" usa enteros vía Hamilton

Después del primer smoke test el usuario reportó dos problemas con la primera implementación: (a) los pesos quedaban con decimales feos (`40, 19.84, 19.84, 19.84 → 99.52`), (b) había que refrescar la página para verlos. Lo que el usuario espera al pulsar "Normalizar" es "números cerrados" que sumen 100 exacto.

Cambiamos a **método del residuo mayor** (Hamilton's largest-remainder method) sobre porcentajes enteros:

```ts
function computeNormalizedWeights(weights: number[]): number[] {
  const total = weights.reduce((acc, w) => acc + w, 0)
  if (total <= 0) {
    // Reparto igualitario entero, residuo 100 % n a los primeros módulos.
    const each = Math.floor(100 / n)
    const remainder = 100 - each * n
    return weights.map((_, i) => each + (i < remainder ? 1 : 0))
  }
  const scaled = weights.map((w) => (w * 100) / total)
  const result = scaled.map(Math.floor)
  const need = 100 - result.reduce((a, b) => a + b, 0)
  // Asignar +1 a los `need` módulos con mayor fracción decimal.
  scaled
    .map((s, i) => ({ idx: i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac || a.idx - b.idx)
    .slice(0, need)
    .forEach(({ idx }) => (result[idx] += 1))
  // Garantizar mínimo de 1 (la columna chequea > 0; con enteros eso es ≥ 1).
  return result
}
```

Para `[40, 19.84, 19.84, 19.84]` (sum 99.52):
- scaled = `[40.19, 19.94, 19.94, 19.94]`
- floors = `[40, 19, 19, 19]`, sum 97
- need = 3
- top 3 fracciones: 0.94 (×3), todas en idx 1, 2, 3
- resultado: `[40, 20, 20, 20]` ✓

**Fallback:** si `n > 100`, los enteros no alcanzan para dar ≥ 1 a cada módulo. En ese caso usamos el algoritmo decimal original con 2 dp y residuo en el último módulo. No es probable en uso real (un ítem con 100+ módulos sería patológico), pero el código no se rompe.

Esa lógica vive del lado servidor en `normalizeStepsWeightsAction(item_id)`. La action devuelve los nuevos pesos; el cliente los aplica al state local con `setSteps(...)`. Los inputs de peso por módulo usan `key={module.weight_pct}` para forzar el remount cuando el peso cambia desde fuera (sin esto, `defaultValue` solo aplica al primer render y la UI queda con el valor stale hasta refrescar).

## Risks / Trade-offs

- **[Confusión durante la migración]** Usuarios que abren un ítem viejo y ven el banner "suma no es 100" por primera vez. → Mitigación: el banner es informativo, no alarmante; ofrece el botón "Normalizar" como salida fácil.
- **[Inconsistencia transitoria entre modo y pesos]** Un ítem en `'equal'` con pesos guardados (1, 1, 1) puede causar dudas si el usuario alterna modos repetidamente. → Mitigación: el toggle muestra el modo activo claramente y el banner solo aparece en `'custom'`.
- **[Performance]** `computeItemProgress` ahora se llama con un parámetro extra; si alguna consumer lo invoca con el shape viejo, el TypeScript debería bajar a opcional. → Mitigación: en la PR, grep por todas las invocaciones (`computeItemProgress(`) y actualizar las queries SQL para incluir `steps_weight_mode` en los `select`.
- **[Race condition al toggle de modo]** Si el usuario toggle-a rápido entre modos mientras está editando un peso, podría persistirse un peso después del toggle. → Mitigación: aceptable. El peso queda persistido y se aplica cuando el modo vuelve a `'custom'`. No corrompe nada.
- **[UI density]** Agregar toggle + indicador de suma + banner puede saturar la sección de pasos. → Mitigación: el indicador de suma es una línea de texto pequeña; el banner solo aparece en `'custom'` con suma ≠ 100; el toggle es compacto.

## Migration Plan

1. **DB**: agregar migración `supabase/migrations/<fecha>_items_steps_weight_mode.sql` con el `ALTER TABLE` y el `UPDATE` que marca los ítems existentes con pasos como `'custom'`.
2. **Tipos**: regenerar los tipos de Supabase si el proyecto los tiene; si no, agregar el campo a mano donde se lea.
3. **Backend**: actualizar `progress.ts`, agregar `setStepsWeightModeAction`, `normalizeStepsWeightsAction` y los schemas Zod.
4. **Frontend**: refactor de `steps-editor.tsx` con el toggle, ocultar inputs en `'equal'`, mostrar indicador de suma + banner + botón "Normalizar" en `'custom'`.
5. **Header / progreso ring**: actualizar todos los `select` de items que alimentan `computeItemProgress` para traer `steps_weight_mode`.
6. **Validación manual**: ítem nuevo en `'equal'` muestra 25% con 1 de 4; mismo ítem en `'custom'` muestra el % proporcional; toggle no destruye pesos; "Normalizar a 100" funciona; agregar/borrar módulos no bloquea por suma.

**Rollback:** la columna `steps_weight_mode` tiene default `'equal'` y la lógica vieja era equivalente a `'custom'`. Revertir el código de `progress.ts` para usar siempre la rama `'custom'` restaura el comportamiento previo. La columna puede quedar en DB inerte; no rompe nada.

## Open Questions

- ¿El botón "Normalizar a 100" lo dejamos visible siempre en `'custom'` o solo cuando la suma ≠ 100? → Propuesta: solo cuando ≠ 100 (menos ruido visual).
- ¿Cuando un ítem queda con un solo módulo, sigue teniendo sentido mostrar el toggle? → Sí. Con un módulo el `weight_mode` no afecta el resultado, pero el toggle no estorba y mantiene consistencia con el resto de la UI.
- ¿Cuando el usuario crea el primer módulo desde la UI, debería pedir un peso o asumir 100? → En modo `'equal'` (el default), el campo de peso desaparece. En modo `'custom'`, sigue pidiendo el peso como hoy. Esto se decide en `NewStepForm` mirando el modo activo.
