import Link from 'next/link'
import { BookOpen, FolderKanban, Layers, ListChecks, type LucideIcon } from 'lucide-react'
import { DeadlineBadge } from '@/components/deadline-badge'
import {
  DEADLINE_GROUP_LABELS,
  DEADLINE_GROUP_ORDER,
  ENTITY_TYPE_LABELS,
  formatDeadlineLabel,
  groupForDeadline,
  type DeadlineEntityType,
  type DeadlineEntry,
} from '@/lib/deadlines/utils'

const TYPE_ICONS: Record<DeadlineEntityType, LucideIcon> = {
  project: FolderKanban,
  item: BookOpen,
  module: Layers,
  task: ListChecks,
}

/** Vista Lista: grupos por urgencia en orden fijo; los vacíos no se muestran. */
export function DeadlineList({
  entries,
  today,
}: {
  entries: DeadlineEntry[]
  today: string
}) {
  const groups = DEADLINE_GROUP_ORDER.map((key) => ({
    key,
    label: DEADLINE_GROUP_LABELS[key],
    items: entries.filter((e) => groupForDeadline(e.deadline, today) === key),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.key} className="space-y-3">
          <h2
            className={`text-xs uppercase tracking-wider ${
              group.key === 'overdue' ? 'text-danger' : 'text-muted'
            }`}
          >
            {group.label} · {group.items.length}
          </h2>
          <ul className="space-y-2">
            {group.items.map((entry) => (
              <li key={`${entry.entityType}-${entry.id}`}>
                <DeadlineEntryRow entry={entry} today={today} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Fila estándar de un deadline; compartida por las vistas Lista y Calendario. */
export function DeadlineEntryRow({
  entry,
  today,
}: {
  entry: DeadlineEntry
  today: string
}) {
  const Icon = TYPE_ICONS[entry.entityType]
  return (
    <Link
      href={entry.href}
      className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:bg-surface-2 transition-colors"
    >
      <Icon className="h-4 w-4 text-muted shrink-0" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{entry.title}</p>
        <p className="text-xs text-muted truncate">
          {ENTITY_TYPE_LABELS[entry.entityType]}
          {entry.contextLabel && <> · {entry.contextLabel}</>}
        </p>
      </div>
      {entry.progress !== null && (
        <span className="tabular text-xs text-muted shrink-0">
          {Math.round(entry.progress * 100)}%
        </span>
      )}
      <DeadlineBadge
        urgency={entry.urgency}
        label={formatDeadlineLabel(entry.deadline, today)}
      />
    </Link>
  )
}
