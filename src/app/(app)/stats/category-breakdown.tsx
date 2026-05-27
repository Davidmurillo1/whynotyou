'use client'

import { useState } from 'react'
import { formatDuration } from '@/lib/format'

export type CategoryStat = {
  id: string
  name: string
  color: string
  emoji: string | null
  minutes: number
  minutesStudy: number
  minutesWork: number
}

type Filter = 'all' | 'study' | 'work'

export function CategoryBreakdown({
  stats,
  hasWork,
}: {
  stats: CategoryStat[]
  hasWork: boolean
}) {
  const [filter, setFilter] = useState<Filter>('all')

  const getValue = (s: CategoryStat) => {
    if (filter === 'study') return s.minutesStudy
    if (filter === 'work') return s.minutesWork
    return s.minutes
  }

  const visible = stats
    .map((s) => ({ ...s, value: getValue(s) }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)

  const total = visible.reduce((a, b) => a + b.value, 0)

  return (
    <div className="space-y-4">
      {hasWork && (
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface p-1" role="radiogroup" aria-label="Filtrar por tipo de proyecto">
          {(['all', 'study', 'work'] as Filter[]).map((f) => {
            const active = filter === f
            const label = f === 'all' ? 'Todo' : f === 'study' ? 'Estudio' : 'Trabajo'
            return (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  active ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {visible.length === 0 || total === 0 ? (
        <p className="text-sm text-muted">Sin minutos en este scope todavía.</p>
      ) : (
        <ul className="space-y-2.5">
          {visible.map((s) => {
            const pct = (s.value / total) * 100
            return (
              <li key={s.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    {s.emoji && <span>{s.emoji}</span>}
                    <span className="font-medium">{s.name}</span>
                  </span>
                  <span className="text-muted tabular">
                    {formatDuration(s.value * 60)} · {Math.round(pct)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: s.color }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
