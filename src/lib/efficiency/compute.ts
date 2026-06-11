/**
 * Eficiencia de tiempo: estimado vs. real.
 *
 * Fórmula clásica de eficiencia temporal (gestión de proyectos / productividad):
 *
 *   η = T_estimado / T_real
 *
 * Lectura directa:
 *   - η > 1.0 → invertiste menos tiempo del estimado → más rápido / adelantado.
 *   - η ≈ 1.0 → en línea con el plan.
 *   - η < 1.0 → invertiste más tiempo del estimado → más lento.
 *
 * Esta versión es puramente temporal: no escala por progreso. Para items en
 * curso, el % refleja "qué tan acelerado vas vs. el tiempo planificado". Si
 * el tiempo invertido supera al estimado sin haber completado, se marca como
 * `exceeded` (overlay independiente) — señal extra de que el plan quedó corto.
 *
 * La estimación efectiva cascadea hacia arriba: la propia siempre gana;
 * si falta, se deriva sumando las estimaciones efectivas de los hijos
 * que tengan una (tareas → módulo → ítem → proyecto).
 *
 * Este módulo es puro (sin I/O), espejo del patrón de `items/progress.ts`.
 */

import {
  computeStepProgress,
  type StepLike,
  type StepsWeightMode,
} from '@/lib/items/progress'

// ---------------------------------------------------------------------------
// Estimación efectiva
// ---------------------------------------------------------------------------

export type EstimateStepLike = StepLike & {
  estimated_minutes?: number | null
}

/** Estimación efectiva de una entidad. `source = 'derived'` cuando se sumó
 *  desde los hijos; en ese caso `covered`/`total` describen la cobertura
 *  ("suma de 2 de 4 módulos"). */
export type EffectiveEstimate = {
  minutes: number
  source: 'own' | 'derived'
  covered: number
  total: number
}

/** Estimación efectiva de un paso. Para módulos sin estimación propia,
 *  deriva sumando las tareas hijas que tengan estimación. */
export function effectiveStepEstimate(
  step: EstimateStepLike,
  allSteps: EstimateStepLike[],
): EffectiveEstimate | null {
  const own = toPositive(step.estimated_minutes)
  const children = allSteps.filter((s) => s.parent_step_id === step.id)
  if (own != null) {
    return { minutes: own, source: 'own', covered: children.length, total: children.length }
  }
  if (children.length === 0) return null
  const withEstimate = children
    .map((c) => toPositive(c.estimated_minutes))
    .filter((m): m is number => m != null)
  if (withEstimate.length === 0) return null
  return {
    minutes: withEstimate.reduce((a, b) => a + b, 0),
    source: 'derived',
    covered: withEstimate.length,
    total: children.length,
  }
}

/** Estimación efectiva de un ítem: propia, o derivada de sus módulos raíz. */
export function effectiveItemEstimate(
  item: { estimated_minutes?: number | null },
  steps?: EstimateStepLike[] | null,
): EffectiveEstimate | null {
  const own = toPositive(item.estimated_minutes)
  const roots = (steps ?? []).filter((s) => !s.parent_step_id)
  if (own != null) {
    return { minutes: own, source: 'own', covered: roots.length, total: roots.length }
  }
  if (roots.length === 0) return null
  const withEstimate = roots
    .map((r) => effectiveStepEstimate(r, steps ?? []))
    .filter((e): e is EffectiveEstimate => e != null)
  if (withEstimate.length === 0) return null
  return {
    minutes: withEstimate.reduce((a, e) => a + e.minutes, 0),
    source: 'derived',
    covered: withEstimate.length,
    total: roots.length,
  }
}

/** Estimación efectiva de un proyecto: propia, o derivada de las estimaciones
 *  efectivas de sus ítems miembros. */
export function effectiveProjectEstimate(
  project: { estimated_minutes?: number | null },
  memberEstimates: Array<EffectiveEstimate | null>,
): EffectiveEstimate | null {
  const own = toPositive(project.estimated_minutes)
  if (own != null) {
    return { minutes: own, source: 'own', covered: memberEstimates.length, total: memberEstimates.length }
  }
  const withEstimate = memberEstimates.filter((e): e is EffectiveEstimate => e != null)
  if (withEstimate.length === 0) return null
  return {
    minutes: withEstimate.reduce((a, e) => a + e.minutes, 0),
    source: 'derived',
    covered: withEstimate.length,
    total: memberEstimates.length,
  }
}

// ---------------------------------------------------------------------------
// Índice de eficiencia y estados
// ---------------------------------------------------------------------------

export type EfficiencyStatus = 'ahead' | 'on_track' | 'slow' | 'exceeded' | 'no_data'

export type Efficiency = {
  /** tiempo ganado / tiempo real. `null` cuando no hay señal suficiente. */
  index: number | null
  status: EfficiencyStatus
  estimateMinutes: number
  actualMinutes: number
  earnedMinutes: number
}

export const EFFICIENCY_STATUS_LABEL: Record<EfficiencyStatus, string> = {
  ahead: 'Adelantado',
  on_track: 'En línea',
  slow: 'Más lento',
  exceeded: 'Estimación superada',
  no_data: 'Sin datos todavía',
}

const AHEAD_THRESHOLD = 1.1
const SLOW_THRESHOLD = 0.9

/** Clasifica un índice ya calculado (p. ej. el agregado de un período en
 *  stats, donde no aplica el overlay de "estimación superada"). */
export function classifyIndex(index: number): 'ahead' | 'on_track' | 'slow' {
  if (index >= AHEAD_THRESHOLD) return 'ahead'
  if (index >= SLOW_THRESHOLD) return 'on_track'
  return 'slow'
}

/** Calcula índice y estado para una entidad con estimación efectiva.
 *  El caller decide qué hacer cuando NO hay estimación (CTA a estimar).
 *
 *  Devuelve `no_data` cuando el tiempo real es 0 — sin sesiones registradas
 *  no hay nada que comparar contra el estimado. */
export function computeEfficiency(input: {
  /** Progreso 0..1 de la entidad (informativo; se preserva en `earnedMinutes`
   *  para usos como el desglose por sesión en stats, pero NO entra al índice). */
  progress: number
  estimateMinutes: number
  actualSeconds: number
  /** true cuando la entidad está completada (ítem done, paso is_done, etc.). */
  completed: boolean
}): Efficiency {
  const actualMinutes = input.actualSeconds / 60
  const earnedMinutes = clamp01(input.progress) * input.estimateMinutes

  const base = {
    estimateMinutes: input.estimateMinutes,
    actualMinutes,
    earnedMinutes,
  }

  if (actualMinutes <= 0) {
    return { ...base, index: null, status: 'no_data' }
  }

  // Eficiencia temporal: η = T_estimado / T_real.
  const index = input.estimateMinutes / actualMinutes

  // Overlay: el tiempo real ya superó al estimado y la entidad no está terminada.
  // Es un caso especial — la entidad sigue ineficiente pero además sabemos que
  // el plan ya quedó corto, lo cual amerita un mensaje distinto de "más lento".
  if (actualMinutes > input.estimateMinutes && !input.completed) {
    return { ...base, index, status: 'exceeded' }
  }
  if (index >= AHEAD_THRESHOLD) return { ...base, index, status: 'ahead' }
  if (index >= SLOW_THRESHOLD) return { ...base, index, status: 'on_track' }
  return { ...base, index, status: 'slow' }
}

// ---------------------------------------------------------------------------
// Atribución de tiempo real por paso
// ---------------------------------------------------------------------------

/** Reparte el tiempo de cada sesión en partes iguales entre sus pasos
 *  asociados (`duración / N`). Devuelve segundos atribuidos por `step_id`.
 *  Las sesiones sin pasos no atribuyen tiempo a ningún paso. */
export function attributeSessionTimeToSteps(
  sessions: Array<{ id: string; duration_seconds: number }>,
  links: Array<{ session_id: string; step_id: string }>,
): Map<string, number> {
  const linksBySession = new Map<string, string[]>()
  for (const link of links) {
    const list = linksBySession.get(link.session_id)
    if (list) list.push(link.step_id)
    else linksBySession.set(link.session_id, [link.step_id])
  }
  const seconds = new Map<string, number>()
  for (const session of sessions) {
    const stepIds = linksBySession.get(session.id)
    if (!stepIds || stepIds.length === 0) continue
    const share = (session.duration_seconds ?? 0) / stepIds.length
    for (const stepId of stepIds) {
      seconds.set(stepId, (seconds.get(stepId) ?? 0) + share)
    }
  }
  return seconds
}

/** Tiempo real de un paso: lo atribuido directamente + lo de sus tareas hijas. */
export function stepActualSeconds(
  step: StepLike,
  allSteps: StepLike[],
  attributed: Map<string, number>,
): number {
  const own = attributed.get(step.id) ?? 0
  const children = allSteps.filter((s) => s.parent_step_id === step.id)
  return children.reduce((acc, c) => acc + (attributed.get(c.id) ?? 0), own)
}

// ---------------------------------------------------------------------------
// Contribución de un paso al progreso del ítem y tiempo ganado por sesión
// ---------------------------------------------------------------------------

/** Fracción 0..1 del progreso TOTAL del ítem que aporta completar este paso.
 *  - Módulo hoja: su share raíz (1/n en 'equal', peso relativo en 'custom').
 *  - Tarea: share raíz del módulo padre × share de la tarea dentro del módulo
 *    (igualitario en 'count', peso relativo en 'weighted').
 *  - Módulo con tareas: 0 — su completitud es derivada, la aportan sus tareas. */
export function stepContributionShare(
  step: StepLike,
  allSteps: StepLike[],
  weightMode: StepsWeightMode | null | undefined,
): number {
  const roots = allSteps.filter((s) => !s.parent_step_id)
  if (roots.length === 0) return 0
  const mode: StepsWeightMode = weightMode ?? 'equal'

  const rootShare = (root: StepLike): number => {
    if (mode === 'equal') return 1 / roots.length
    const totalWeight = roots.reduce((a, r) => a + Number(r.weight_pct), 0)
    if (totalWeight <= 0) return 0
    return Number(root.weight_pct) / totalWeight
  }

  if (!step.parent_step_id) {
    const children = allSteps.filter((s) => s.parent_step_id === step.id)
    return children.length === 0 ? rootShare(step) : 0
  }

  const parent = allSteps.find((s) => s.id === step.parent_step_id)
  if (!parent) return 0
  const siblings = allSteps.filter((s) => s.parent_step_id === parent.id)
  if (siblings.length === 0) return 0

  if ((parent.progress_mode ?? 'weighted') === 'count') {
    return rootShare(parent) / siblings.length
  }
  const totalWeight = siblings.reduce((a, s) => a + Number(s.weight_pct), 0)
  if (totalWeight <= 0) return 0
  return rootShare(parent) * (Number(step.weight_pct) / totalWeight)
}

/** Minutos "ganados" por una sesión contra la estimación efectiva del ítem.
 *  - Ítem por unidades: `(units_progressed / total_units) × estimación`.
 *  - Ítem por pasos: suma de las contribuciones de los pasos completados
 *    en esa sesión × estimación. */
export function sessionEarnedMinutes(input: {
  estimateMinutes: number
  totalUnits: number
  unitsProgressed: number
  steps: StepLike[]
  completedStepIds: string[]
  weightMode: StepsWeightMode | null | undefined
}): number {
  if (input.steps.length > 0) {
    const completed = new Set(input.completedStepIds)
    const share = input.steps
      .filter((s) => completed.has(s.id))
      .reduce((a, s) => a + stepContributionShare(s, input.steps, input.weightMode), 0)
    return share * input.estimateMinutes
  }
  if (!Number.isFinite(input.totalUnits) || input.totalUnits <= 0) return 0
  return (Number(input.unitsProgressed) / Number(input.totalUnits)) * input.estimateMinutes
}

// ---------------------------------------------------------------------------

function toPositive(value: number | null | undefined): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 1) return 1
  return n
}

// Re-export del progreso de pasos para que los consumers de eficiencia no
// tengan que importar de dos módulos.
export { computeStepProgress }
