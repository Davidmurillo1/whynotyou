'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

/** Inicio del rango "Todo" — anterior a cualquier sesión posible. */
export const ALL_TIME_START = '2000-01-01'

type Preset = { key: string; label: string; days?: number }

const PRESETS: Preset[] = [
  { key: '7d', label: '7 días', days: 7 },
  { key: '30d', label: '30 días', days: 30 },
  { key: '90d', label: '90 días', days: 90 },
  { key: 'year', label: 'Este año' },
  { key: 'all', label: 'Todo' },
]

/**
 * Selector de rango de la sección Eficiencia. Sincroniza `?desde=&hasta=`
 * vía router.replace; el cómputo ocurre server-side en el RSC de stats.
 * `today` llega del server calculado en la timezone del perfil.
 */
export function EfficiencyRangePicker({
  desde,
  hasta,
  today,
}: {
  desde: string
  hasta: string
  today: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const presetRange = (p: Preset): { desde: string; hasta: string } => {
    if (p.key === 'all') return { desde: ALL_TIME_START, hasta: today }
    if (p.key === 'year') return { desde: `${today.slice(0, 4)}-01-01`, hasta: today }
    return { desde: shiftDays(today, -(p.days! - 1)), hasta: today }
  }

  const apply = (nextDesde: string, nextHasta: string) => {
    const params = new URLSearchParams()
    params.set('desde', nextDesde)
    params.set('hasta', nextHasta)
    startTransition(() => {
      router.replace(`/stats?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${pending ? 'opacity-60' : ''}`}
      aria-label="Rango de fechas de eficiencia"
    >
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 text-xs">
        {PRESETS.map((p) => {
          const range = presetRange(p)
          const active = range.desde === desde && range.hasta === hasta
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => apply(range.desde, range.hasta)}
              disabled={pending}
              aria-pressed={active}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors disabled:opacity-50 ${
                active ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text'
              }`}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      <div className="inline-flex items-center gap-1.5 text-xs text-muted">
        <input
          type="date"
          value={desde}
          max={hasta}
          onChange={(e) => e.target.value && apply(e.target.value, hasta)}
          aria-label="Desde"
          className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text focus:border-accent focus:outline-none"
        />
        <span aria-hidden>→</span>
        <input
          type="date"
          value={hasta}
          min={desde}
          onChange={(e) => e.target.value && apply(desde, e.target.value)}
          aria-label="Hasta"
          className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text focus:border-accent focus:outline-none"
        />
      </div>
    </div>
  )
}

/** Suma `delta` días a una fecha YYYY-MM-DD (aritmética UTC, sin tz local). */
function shiftDays(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}
