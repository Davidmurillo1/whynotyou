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

export type ModuleEfficiency = {
  id: string
  name: string
  estimate: EffectiveEstimate
  efficiency: Efficiency
}

/**
 * Sección "Eficiencia" del detalle del ítem (server component).
 * - Sin estimación efectiva: invitación a estimar (link al editor de detalles).
 * - Con estimación: índice + chip + bullet, y desglose por módulo cuando
 *   los pasos tienen estimaciones.
 */
export function ItemEfficiencySection({
  estimate,
  efficiency,
  modules,
  unestimatedModuleCount,
}: {
  estimate: EffectiveEstimate | null
  efficiency: Efficiency | null
  modules: ModuleEfficiency[]
  unestimatedModuleCount: number
}) {
  if (!estimate || !efficiency) {
    return (
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted">Eficiencia</h2>
        <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-5 text-center space-y-1.5">
          <p className="text-sm text-text">¿Cuánto tiempo pensás que te va a llevar?</p>
          <p className="text-xs text-muted">
            Estimalo y medí tu eficiencia: te mostramos si vas más rápido o más lento que tu
            plan.{' '}
            <a href="#detalles" className="text-accent hover:underline underline-offset-2">
              Agregar estimación →
            </a>
          </p>
        </div>
      </section>
    )
  }

  // Mostrar el módulo de eficiencia solo cuando ya hay tiempo invertido. Sin
  // sesiones, el bullet a 0% es ruido: la sección queda más limpia mostrando
  // únicamente la estimación del plan.
  if (efficiency.actualMinutes <= 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted">Eficiencia</h2>
        <div className="rounded-xl border border-border bg-surface px-4 py-5 text-center space-y-1.5">
          <p className="text-sm text-text">
            Estimación: <span className="tabular">{formatEffectiveEstimate(estimate)}</span>
          </p>
          <p className="text-xs text-muted">
            Cuando registres tu primera sesión, el índice de eficiencia aparece acá.
          </p>
        </div>
      </section>
    )
  }

  const coverage = estimateCoverageHint(estimate, 'módulos')

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

      {modules.length > 0 && (
        <div className="rounded-xl border border-border bg-surface px-4 py-3 space-y-3">
          <p className="text-[11px] uppercase tracking-wider text-muted">Por módulo</p>
          <ul className="space-y-3">
            {modules.map((m) => (
              <li key={m.id} className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-text truncate">{m.name}</p>
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
          {unestimatedModuleCount > 0 && (
            <p className="text-[11px] text-muted/80">
              {unestimatedModuleCount === 1
                ? '1 módulo sin estimación — estimalo desde la lista de pasos.'
                : `${unestimatedModuleCount} módulos sin estimación — estimalos desde la lista de pasos.`}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
