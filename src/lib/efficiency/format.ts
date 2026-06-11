import { formatDuration } from '@/lib/format'
import type { EffectiveEstimate } from './compute'

/** Formatea minutos de estimación con el estilo de duraciones de la app
 *  ("2h 30m"). `approx` antepone `≈` (estimaciones derivadas). */
export function formatEstimate(minutes: number, opts?: { approx?: boolean }): string {
  const text = formatDuration(Math.round(minutes) * 60)
  return opts?.approx ? `≈ ${text}` : text
}

/** Formatea una estimación efectiva (deriva el `≈` de su `source`). */
export function formatEffectiveEstimate(estimate: EffectiveEstimate): string {
  return formatEstimate(estimate.minutes, { approx: estimate.source === 'derived' })
}

/** Hint de cobertura para estimaciones derivadas parciales:
 *  "suma de 2 de 4 módulos" / "suma de 1 de 3 tareas" / "suma de 2 de 5 ítems". */
export function estimateCoverageHint(
  estimate: EffectiveEstimate,
  childNoun: 'módulos' | 'tareas' | 'ítems',
): string | null {
  if (estimate.source !== 'derived') return null
  if (estimate.covered >= estimate.total) return null
  return `suma de ${estimate.covered} de ${estimate.total} ${childNoun}`
}

/** Frase legible para el índice de eficiencia:
 *  1.25 → "25 % más rápido que lo estimado"
 *  0.80 → "20 % más lento que lo estimado"
 *  ~1.0 → "En línea con lo estimado" */
export function describeIndex(index: number): string {
  const pct = Math.round((index - 1) * 100)
  if (pct > 0) return `${pct} % más rápido que lo estimado`
  if (pct < 0) return `${Math.abs(pct)} % más lento que lo estimado`
  return 'En línea con lo estimado'
}

/** Delta legible entre estimado y real para entidades terminadas:
 *  "terminado 2h 15m antes de lo estimado" / "terminado 40m después de lo estimado". */
export function describeCompletionDelta(estimateMinutes: number, actualMinutes: number): string {
  const deltaMin = Math.round(estimateMinutes - actualMinutes)
  if (deltaMin === 0) return 'terminado justo en lo estimado'
  const text = formatDuration(Math.abs(deltaMin) * 60)
  return deltaMin > 0
    ? `terminado ${text} antes de lo estimado`
    : `terminado ${text} después de lo estimado`
}
