import type { DeadlineUrgency } from '@/lib/deadlines/utils'

const PILL: Record<DeadlineUrgency, string> = {
  overdue: 'bg-danger/10 text-danger',
  today: 'bg-warning/10 text-warning',
  soon: 'bg-warning/10 text-warning',
  later: 'bg-surface-2 text-muted',
}

const DOT: Record<DeadlineUrgency, string> = {
  overdue: 'bg-danger',
  today: 'bg-warning',
  soon: 'bg-warning',
  later: 'bg-muted',
}

/** Indicador de fecha límite, único en toda la app: dot de urgencia + texto.
 *  El `label` viene de `formatDeadlineLabel(deadline, today)`. */
export function DeadlineBadge({
  urgency,
  label,
  size = 'sm',
}: {
  urgency: DeadlineUrgency
  label: string
  size?: 'sm' | 'md'
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium whitespace-nowrap ${
        size === 'sm' ? 'gap-1.5 text-[11px] px-2 py-0.5' : 'gap-2 text-xs px-2.5 py-1'
      } ${PILL[urgency]}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT[urgency]}`} />
      {label}
    </span>
  )
}
