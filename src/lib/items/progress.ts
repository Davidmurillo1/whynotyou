/**
 * Cálculo de progreso de un ítem.
 *
 * Modelo jerárquico (1 nivel):
 *
 * - **Pasos sin hijos** ("hojas"): el progreso es 1 si `is_done`, 0 si no.
 * - **Pasos con hijos** ("módulos"): el progreso es fraccional, calculado según
 *   `progress_mode` del módulo:
 *     - `'weighted'` (default): `sum(child.weight WHERE done) / sum(child.weight)`
 *     - `'count'`: `done_children / total_children` (todas las tareas valen igual)
 *   El campo `is_done` del módulo se ignora (estado derivado).
 * - **Ítem**: el progreso entre módulos depende del `steps_weight_mode` del ítem:
 *     - `'equal'` (default para ítems nuevos): cada módulo aporta `1/n` —
 *       `weight_pct` se ignora.
 *     - `'custom'`: suma ponderada de cada paso raíz por su peso, igual que la
 *       lógica anterior — `sum(root.weight * progress(root)) / sum(root.weight)`.
 *
 * Si el ítem no tiene pasos, se cae al modelo de unidades:
 * `current_units / total_units`.
 */

export type ProgressMode = 'weighted' | 'count'
export type StepsWeightMode = 'equal' | 'custom'

export type StepLike = {
  id: string
  weight_pct: number
  is_done: boolean
  parent_step_id?: string | null
  progress_mode?: ProgressMode | null
}

export type ItemProgressInput = {
  current_units: number | string
  total_units: number | string
  steps_weight_mode?: StepsWeightMode | null
}

/** Fracción 0..1 del progreso de un paso individual, considerando sus hijos. */
export function computeStepProgress(step: StepLike, allSteps: StepLike[]): number {
  const children = allSteps.filter((s) => s.parent_step_id === step.id)
  if (children.length === 0) {
    return step.is_done ? 1 : 0
  }
  const mode: ProgressMode = step.progress_mode ?? 'weighted'
  if (mode === 'count') {
    const done = children.filter((c) => c.is_done).length
    return clamp01(done / children.length)
  }
  // weighted (default)
  const totalWeight = children.reduce((acc, c) => acc + Number(c.weight_pct), 0)
  if (totalWeight <= 0) return 0
  const doneWeight = children.reduce((acc, c) => acc + (c.is_done ? Number(c.weight_pct) : 0), 0)
  return clamp01(doneWeight / totalWeight)
}

/** Devuelve true si el paso debe considerarse completado a nivel "ítem".
 *  Para módulos con hijos: solo cuando *todos* los hijos están done.
 *  El modo de progreso no afecta cuándo el módulo está "totalmente done". */
export function isStepEffectivelyDone(step: StepLike, allSteps: StepLike[]): boolean {
  const children = allSteps.filter((s) => s.parent_step_id === step.id)
  if (children.length === 0) return step.is_done
  return children.every((c) => c.is_done)
}

export function computeItemProgress(item: ItemProgressInput, steps?: StepLike[] | null): number {
  if (steps && steps.length > 0) {
    const roots = steps.filter((s) => !s.parent_step_id)
    if (roots.length === 0) return 0

    // Default a 'equal' cuando no llega: es el comportamiento más predecible.
    // Los ítems pre-cambio quedan en 'custom' por la migración.
    const mode: StepsWeightMode = item.steps_weight_mode ?? 'equal'

    if (mode === 'equal') {
      // Cada módulo aporta 1/n, ignorando weight_pct.
      const sum = roots.reduce((acc, root) => acc + computeStepProgress(root, steps), 0)
      return clamp01(sum / roots.length)
    }

    // mode === 'custom' — lógica histórica de pesos relativos.
    const totalWeight = roots.reduce((acc, s) => acc + Number(s.weight_pct), 0)
    if (totalWeight <= 0) return 0
    const accum = roots.reduce((acc, root) => {
      const rootProgress = computeStepProgress(root, steps)
      return acc + Number(root.weight_pct) * rootProgress
    }, 0)
    return clamp01(accum / totalWeight)
  }
  const total = Number(item.total_units)
  if (!Number.isFinite(total) || total <= 0) return 0
  return clamp01(Number(item.current_units) / total)
}

/** Cuenta pasos raíz completados / total raíz (lo que el usuario percibe como "módulos"). */
export function stepsSummary(steps?: StepLike[] | null): { done: number; total: number } {
  if (!steps || steps.length === 0) return { done: 0, total: 0 }
  const roots = steps.filter((s) => !s.parent_step_id)
  return {
    done: roots.filter((r) => isStepEffectivelyDone(r, steps)).length,
    total: roots.length,
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 1) return 1
  return n
}
