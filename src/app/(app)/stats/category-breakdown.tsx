'use client'

import { formatDuration } from '@/lib/format'

type Stat = {
  id: string
  name: string
  color: string
  emoji: string | null
  minutes: number
}

export function CategoryBreakdown({ stats }: { stats: Stat[] }) {
  const total = stats.reduce((a, b) => a + b.minutes, 0)
  if (total === 0) return null

  return (
    <ul className="space-y-2.5">
      {stats.map((s) => {
        const pct = (s.minutes / total) * 100
        return (
          <li key={s.id} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                {s.emoji && <span>{s.emoji}</span>}
                <span className="font-medium">{s.name}</span>
              </span>
              <span className="text-muted tabular">
                {formatDuration(s.minutes * 60)} · {Math.round(pct)}%
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
  )
}
