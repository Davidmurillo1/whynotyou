import { formatDuration } from '@/lib/format'
import {
  EFFICIENCY_STATUS_LABEL,
  type Efficiency,
  type EfficiencyStatus,
} from '@/lib/efficiency/compute'
import { describeIndex } from '@/lib/efficiency/format'

/** Clases por estado para el chip (texto + fondo suave, mismo patrón que los
 *  chips de scope). Siempre acompañadas de la etiqueta textual. */
const CHIP_CLS: Record<EfficiencyStatus, string> = {
  ahead: 'border-success/30 bg-success/10 text-success',
  on_track: 'border-accent/30 bg-accent/10 text-accent',
  slow: 'border-warning/30 bg-warning/10 text-warning',
  exceeded: 'border-danger/30 bg-danger/10 text-danger',
  no_data: 'border-border bg-surface-2 text-muted',
}

const FILL_CLS: Record<EfficiencyStatus, string> = {
  ahead: 'bg-success',
  on_track: 'bg-accent',
  slow: 'bg-warning',
  exceeded: 'bg-warning',
  no_data: 'bg-muted/40',
}

export function EfficiencyChip({ status }: { status: EfficiencyStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${CHIP_CLS[status]}`}
    >
      {EFFICIENCY_STATUS_LABEL[status]}
    </span>
  )
}

/**
 * Barra bullet de eficiencia: el track representa la estimación efectiva,
 * el fill el tiempo real invertido. Si el real supera el estimado, el
 * excedente se dibuja en `danger` pasando el marcador de estimación.
 */
export function EfficiencyBullet({
  efficiency,
  size = 'md',
}: {
  efficiency: Efficiency
  size?: 'md' | 'sm'
}) {
  const { estimateMinutes, actualMinutes, status } = efficiency
  // Escala: si hay excedente, el eje se extiende hasta el tiempo real.
  const axisMinutes = Math.max(estimateMinutes, actualMinutes)
  const pct = (minutes: number) =>
    axisMinutes > 0 ? Math.min(100, (minutes / axisMinutes) * 100) : 0

  const withinPct = pct(Math.min(actualMinutes, estimateMinutes))
  const overrunPct = actualMinutes > estimateMinutes ? pct(actualMinutes) - pct(estimateMinutes) : 0
  const markerPct = pct(estimateMinutes)
  const barH = size === 'md' ? 'h-2.5' : 'h-1.5'

  return (
    <div className="space-y-1.5">
      <div className={`relative w-full overflow-hidden rounded-full bg-surface-2 ${barH}`}>
        {/* Tiempo real dentro del estimado */}
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${FILL_CLS[status]}`}
          style={{ width: `${withinPct}%` }}
        />
        {/* Excedente más allá del estimado */}
        {overrunPct > 0 && (
          <div
            className="absolute inset-y-0 bg-danger/70"
            style={{ left: `${markerPct}%`, width: `${overrunPct}%` }}
          />
        )}
        {/* Marcador de la estimación */}
        {markerPct < 100 && (
          <div
            className="absolute inset-y-0 w-px bg-text/50"
            style={{ left: `${markerPct}%` }}
            aria-hidden
          />
        )}
      </div>
      {size === 'md' && (
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            Invertido{' '}
            <span className="text-text tabular">
              {formatDuration(Math.round(actualMinutes * 60))}
            </span>
          </span>
          <span>
            Estimado{' '}
            <span className="text-text tabular">
              {formatDuration(Math.round(estimateMinutes) * 60)}
            </span>
          </span>
        </div>
      )}
    </div>
  )
}

/** Bloque completo: índice grande legible + chip + bullet. Para las secciones
 *  "Eficiencia" del detalle de ítem y de proyecto. */
export function EfficiencySummary({ efficiency }: { efficiency: Efficiency }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2.5">
        {efficiency.index != null && efficiency.status !== 'no_data' && (
          <p className="text-sm text-text">{describeIndex(efficiency.index)}</p>
        )}
        <EfficiencyChip status={efficiency.status} />
      </div>
      <EfficiencyBullet efficiency={efficiency} />
    </div>
  )
}
