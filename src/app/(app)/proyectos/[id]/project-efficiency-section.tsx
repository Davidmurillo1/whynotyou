import Link from 'next/link'
import { formatDuration } from '@/lib/format'
import type { EffectiveEstimate, Efficiency } from '@/lib/efficiency/compute'
import {
  estimateCoverageHint,
  formatEffectiveEstimate,
} from '@/lib/efficiency/format'
import {
  EfficiencyBullet,
  EfficiencyChip,
  EfficiencySummary,
} from '@/components/efficiency-bullet'

export type MemberEfficiency = {
  id: string
  title: string
  estimate: EffectiveEstimate
  efficiency: Efficiency
}

/**
 * Sección "Eficiencia" del detalle del proyecto (server component).
 * - Sin estimación efectiva: invitación a estimar.
 * - Con estimación: bullet agregado + índice + chip, desglose por ítem
 *   estimado y grupo aparte para los miembros sin estimación.
 */
export function ProjectEfficiencySection({
  estimate,
  efficiency,
  members,
  unestimated,
}: {
  estimate: EffectiveEstimate | null
  efficiency: Efficiency | null
  members: MemberEfficiency[]
  unestimated: Array<{ id: string; title: string }>
}) {
  if (!estimate) {
    return (
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted">Eficiencia</h2>
        <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-5 text-center space-y-1.5">
          <p className="text-sm text-text">¿Cuánto tiempo pensás que lleva este proyecto?</p>
          <p className="text-xs text-muted">
            Estimá el proyecto (con el lápiz de arriba) o estimá sus ítems, y acá te mostramos
            si vas más rápido o más lento que el plan.
          </p>
        </div>
      </section>
    )
  }

  if (!efficiency) {
    return (
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted">Eficiencia</h2>
        <div className="rounded-xl border border-border bg-surface px-4 py-5 text-center space-y-1.5">
          <p className="text-sm text-text">Sin datos todavía</p>
          <p className="text-xs text-muted">
            Estimación del proyecto:{' '}
            <span className="text-text tabular">{formatEffectiveEstimate(estimate)}</span>. Cuando
            registres sesiones en alguno de sus ítems estimados, el índice de eficiencia aparece
            acá.
          </p>
        </div>
      </section>
    )
  }

  const coverage = estimateCoverageHint(estimate, 'ítems')

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-xs uppercase tracking-wider text-muted">Eficiencia</h2>
        <p className="text-xs text-muted">
          Estimación:{' '}
          <span className="text-text tabular">{formatEffectiveEstimate(estimate)}</span>
          {coverage && <span className="text-muted/70"> · {coverage}</span>}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface px-4 py-4">
        <EfficiencySummary efficiency={efficiency} />
      </div>

      {members.length > 0 && (
        <div className="rounded-xl border border-border bg-surface px-4 py-3 space-y-3">
          <p className="text-[11px] uppercase tracking-wider text-muted">Por ítem</p>
          <ul className="space-y-3">
            {members.map((m) => (
              <li key={m.id} className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={`/item/${m.id}`}
                    className="text-sm text-text truncate hover:text-accent transition-colors"
                  >
                    {m.title}
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-muted tabular">
                      {formatDuration(Math.round(m.efficiency.actualMinutes * 60))} /{' '}
                      {formatEffectiveEstimate(m.estimate)}
                    </span>
                    <EfficiencyChip status={m.efficiency.status} />
                  </div>
                </div>
                <EfficiencyBullet efficiency={m.efficiency} size="sm" />
              </li>
            ))}
          </ul>
          {unestimated.length > 0 && (
            <div className="space-y-1 border-t border-border/60 pt-2.5">
              <p className="text-[11px] uppercase tracking-wider text-muted/80">Sin estimación</p>
              <ul className="space-y-0.5">
                {unestimated.map((i) => (
                  <li key={i.id}>
                    <Link
                      href={`/item/${i.id}`}
                      className="text-xs text-muted hover:text-text transition-colors"
                    >
                      {i.title} →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
