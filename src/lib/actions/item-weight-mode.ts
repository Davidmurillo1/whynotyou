'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  setStepsWeightModeSchema,
  normalizeStepsWeightsSchema,
  type SetStepsWeightModeInput,
  type NormalizeStepsWeightsInput,
} from '@/lib/items/steps-schemas'

export type WeightModeActionResult = { ok: true } | { error: string }

export type NormalizeWeightsResult =
  | { ok: true; weights: Array<{ id: string; weight_pct: number }> }
  | { error: string }

function revalidateItem(itemId: string) {
  revalidatePath(`/item/${itemId}`)
  revalidatePath('/dashboard')
  revalidatePath('/biblioteca')
  revalidatePath('/stats')
}

/**
 * Cambia el modo de reparto de peso entre módulos de un ítem.
 * El `weight_pct` de cada módulo se PRESERVA en DB; el modo solo decide
 * cómo se interpreta al calcular el progreso (ver `computeItemProgress`).
 */
export async function setStepsWeightModeAction(
  input: SetStepsWeightModeInput,
): Promise<WeightModeActionResult> {
  const parsed = setStepsWeightModeSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás iniciar sesión.' }

  const { data: item } = await supabase
    .from('items')
    .select('id')
    .eq('id', parsed.data.item_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!item) return { error: 'No encontramos ese ítem.' }

  const { error } = await supabase
    .from('items')
    .update({ steps_weight_mode: parsed.data.mode })
    .eq('id', parsed.data.item_id)
    .eq('user_id', user.id)
  if (error) return { error: 'No pudimos actualizar el modo de peso.' }

  revalidateItem(parsed.data.item_id)
  return { ok: true }
}

/**
 * Reescala los `weight_pct` de los módulos raíz del ítem para que sumen 100.
 *
 * Estrategia: **método del residuo mayor** (Hamilton) sobre porcentajes enteros.
 * Cada módulo recibe un peso entero ≥ 1; los enteros suman exactamente 100.
 * Eso da "números cerrados" (40, 20, 20, 20 en vez de 40, 19.84, 19.84, 19.84)
 * que son lo que el usuario espera al normalizar.
 *
 * Algoritmo:
 *   1. scaled[i] = weight[i] * 100 / total
 *   2. floor[i] = floor(scaled[i])
 *   3. need = 100 - sum(floor)
 *   4. Asignar +1 a los `need` módulos con mayor fracción decimal (residuo).
 *   5. Garantizar mínimo de 1 por módulo (el check de columna es `> 0`;
 *      con enteros, eso significa ≥ 1).
 *
 * Edge cases:
 * - Si todos los pesos son 0: reparto igualitario en enteros, distribuyendo
 *   el residuo de `100 % n` entre los primeros módulos.
 * - Si hay más de 100 módulos: no entran todos en enteros distintos de 0,
 *   así que caemos al algoritmo anterior con decimales de 2 lugares.
 *
 * Operación atómica solo a nivel server action: si un update falla a la
 * mitad, los anteriores quedan persistidos (mismo trade-off que
 * `reorderStepsAction`). Es aceptable porque el usuario puede reintentar.
 */
export async function normalizeStepsWeightsAction(
  input: NormalizeStepsWeightsInput,
): Promise<NormalizeWeightsResult> {
  const parsed = normalizeStepsWeightsSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás iniciar sesión.' }

  // Traemos solo los módulos raíz, ordenados por posición.
  const { data: rootsRaw, error: readError } = await supabase
    .from('item_steps')
    .select('id, weight_pct, position')
    .eq('item_id', parsed.data.item_id)
    .eq('user_id', user.id)
    .is('parent_step_id', null)
    .order('position', { ascending: true })
  if (readError) return { error: 'No pudimos leer los módulos del ítem.' }

  const roots = (rootsRaw ?? []).map((r) => ({
    id: r.id as string,
    weight_pct: Number(r.weight_pct),
  }))

  if (roots.length === 0) {
    return { ok: true, weights: [] }
  }

  const normalized = computeNormalizedWeights(roots.map((r) => r.weight_pct))
  const newWeights = roots.map((r, idx) => ({ id: r.id, weight_pct: normalized[idx] }))

  // Persistir uno por uno. Mismo patrón que reorderStepsAction.
  for (const w of newWeights) {
    const { error } = await supabase
      .from('item_steps')
      .update({ weight_pct: w.weight_pct })
      .eq('id', w.id)
      .eq('user_id', user.id)
      .eq('item_id', parsed.data.item_id)
    if (error) return { error: 'No pudimos normalizar los pesos.' }
  }

  revalidateItem(parsed.data.item_id)
  return { ok: true, weights: newWeights }
}

/** Reparto integer-first usando el método del residuo mayor.
 *  Exportado para tests futuros / inspección; no exportar como server action. */
function computeNormalizedWeights(weights: number[]): number[] {
  const n = weights.length
  if (n === 0) return []

  // Fallback para casos donde enteros no alcanzan (n > 100): decimales 2 dp.
  if (n > 100) return normalizeWithDecimals(weights)

  const total = weights.reduce((acc, w) => acc + w, 0)

  if (total <= 0) {
    // Reparto igualitario entero. El residuo 100 % n se reparte entre los
    // primeros `remainder` módulos.
    const each = Math.floor(100 / n)
    const remainder = 100 - each * n
    return weights.map((_, i) => each + (i < remainder ? 1 : 0))
  }

  const scaled = weights.map((w) => (w * 100) / total)
  const result = scaled.map((s) => Math.floor(s))
  const assigned = result.reduce((acc, f) => acc + f, 0)
  const need = 100 - assigned

  // Ordenar índices por fracción decimal descendente; empates por índice asc
  // (estable, predecible para tests).
  const byRemainder = scaled
    .map((s, i) => ({ idx: i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac || a.idx - b.idx)

  for (let i = 0; i < need && i < byRemainder.length; i++) {
    result[byRemainder[i].idx] += 1
  }

  // Garantizar mínimo de 1 por módulo. Si algún módulo entró con peso 0
  // (no debería: la columna es `> 0`), bump a 1 y restamos del más grande
  // que pueda dar uno sin caer por debajo del mínimo.
  for (let i = 0; i < result.length; i++) {
    if (result[i] < 1) {
      result[i] = 1
      let maxIdx = -1
      for (let j = 0; j < result.length; j++) {
        if (j !== i && result[j] > 1 && (maxIdx === -1 || result[j] > result[maxIdx])) {
          maxIdx = j
        }
      }
      if (maxIdx !== -1) result[maxIdx] -= 1
    }
  }

  return result
}

/** Algoritmo anterior con decimales — solo se usa para n > 100, donde
 *  los enteros no alcanzan para dar ≥ 1 a cada módulo. */
function normalizeWithDecimals(weights: number[]): number[] {
  const n = weights.length
  const total = weights.reduce((acc, w) => acc + w, 0)
  if (total <= 0) {
    const each = Math.round((100 / n) * 100) / 100
    return weights.map((_, idx) =>
      idx === n - 1 ? Number((100 - each * (n - 1)).toFixed(2)) : each,
    )
  }
  const scaled = weights.map((w) => Math.round((w / total) * 10000) / 100)
  const sumScaled = scaled.reduce((acc, x) => acc + x, 0)
  const drift = Number((100 - sumScaled).toFixed(2))
  return scaled.map((s, idx) => (idx === n - 1 ? Number((s + drift).toFixed(2)) : s))
}
