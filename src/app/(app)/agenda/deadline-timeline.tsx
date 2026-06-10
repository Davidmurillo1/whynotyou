import Link from 'next/link'
import { DeadlineBadge } from '@/components/deadline-badge'
import {
  ENTITY_TYPE_LABELS,
  formatDeadlineLabel,
  type DeadlineEntry,
  type DeadlineUrgency,
} from '@/lib/deadlines/utils'
import { DeadlineEntryRow } from './deadline-list'

/** Horizonte del eje: mínimo 4 semanas, máximo 12. Lo que cae más allá se
 *  ancla al borde derecho con un indicador de desborde. */
const HORIZON_MIN_DAYS = 28
const HORIZON_MAX_DAYS = 84

const BAR_CLASS: Record<DeadlineUrgency, string> = {
  overdue: 'bg-danger',
  today: 'bg-warning',
  soon: 'bg-warning',
  later: 'bg-accent/70',
}

/** Vista Línea de tiempo ("pista de aterrizaje"): una barra por entidad desde
 *  hoy hasta su deadline — el largo es el tiempo que queda — cruzada con el %
 *  de progreso actual. Vencidos en franja propia, sin pista. */
export function DeadlineTimeline({
  entries,
  today,
}: {
  entries: DeadlineEntry[]
  today: string
}) {
  const overdue = entries.filter((e) => e.daysLeft < 0)
  const upcoming = entries.filter((e) => e.daysLeft >= 0)

  const maxDays = upcoming.reduce((max, e) => Math.max(max, e.daysLeft), 0)
  const horizon = Math.min(HORIZON_MAX_DAYS, Math.max(HORIZON_MIN_DAYS, maxDays))

  const marks = [
    { label: 'Hoy', day: 0 },
    { label: '1 sem', day: 7 },
    { label: '2 sem', day: 14 },
    { label: '1 mes', day: 30 },
    { label: '2 meses', day: 61 },
  ].filter((m) => m.day <= horizon)

  return (
    <div className="space-y-8">
      {overdue.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-danger">
            Vencidos · {overdue.length}
          </h2>
          <ul className="space-y-2 rounded-2xl border border-danger/30 bg-danger/5 p-2">
            {overdue.map((entry) => (
              <li key={`${entry.entityType}-${entry.id}`}>
                <DeadlineEntryRow entry={entry} today={today} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="space-y-4">
          <div className="relative h-4" aria-hidden>
            {marks.map((m) => (
              <span
                key={m.day}
                className="absolute -translate-x-px text-[10px] uppercase tracking-wider text-muted/80 whitespace-nowrap"
                style={{ left: `${(m.day / horizon) * 100}%` }}
              >
                {m.label}
              </span>
            ))}
          </div>

          <div className="relative">
            <div aria-hidden>
              {marks.map((m) => (
                <span
                  key={m.day}
                  className="absolute top-0 bottom-0 w-px bg-border/40"
                  style={{ left: `${(m.day / horizon) * 100}%` }}
                />
              ))}
            </div>

            <ul className="relative space-y-5">
              {upcoming.map((entry) => {
                const clamped = entry.daysLeft > horizon
                const widthPct = clamped
                  ? 100
                  : Math.max(1.5, (entry.daysLeft / horizon) * 100)
                return (
                  <li key={`${entry.entityType}-${entry.id}`} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm min-w-0 truncate">
                        <Link href={entry.href} className="font-medium hover:text-accent transition-colors">
                          {entry.title}
                        </Link>
                        <span className="text-xs text-muted">
                          {' '}· {ENTITY_TYPE_LABELS[entry.entityType]}
                          {entry.contextLabel && <> · {entry.contextLabel}</>}
                        </span>
                      </p>
                      <span className="flex items-center gap-2 shrink-0">
                        {entry.progress !== null && (
                          <span className="tabular text-xs text-muted">
                            {Math.round(entry.progress * 100)}%
                          </span>
                        )}
                        <DeadlineBadge
                          urgency={entry.urgency}
                          label={formatDeadlineLabel(entry.deadline, today)}
                        />
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="relative h-1.5 flex-1 rounded-full bg-surface-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${BAR_CLASS[entry.urgency]}`}
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                      {clamped && (
                        <span
                          className="text-[10px] leading-none text-muted shrink-0"
                          title="Más allá del horizonte visible"
                        >
                          »
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          <p className="text-[11px] text-muted/80">
            El largo de cada barra es el tiempo que queda; el porcentaje, lo que ya avanzaste.
          </p>
        </section>
      )}

      {upcoming.length === 0 && overdue.length > 0 && (
        <p className="text-sm text-muted">Todo lo pendiente ya está vencido. A remontar.</p>
      )}
    </div>
  )
}
