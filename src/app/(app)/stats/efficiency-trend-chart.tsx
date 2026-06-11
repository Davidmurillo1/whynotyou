'use client'

import { useSyncExternalStore } from 'react'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export type TrendPoint = {
  /** YYYY-MM-DD (timezone del perfil). */
  date: string
  /** Minutos acumulados invertidos hasta este día. */
  invertido: number
  /** Minutos acumulados ganados hasta este día. */
  ganado: number
}

const subscribeNoop = () => () => {}
const getTrue = () => true
const getFalse = () => false

/**
 * Evolución acumulada del período: tiempo invertido (neutro) vs. tiempo
 * ganado (accent). Si la curva ganada va por encima, vas adelantado.
 */
export function EfficiencyTrendChart({ points }: { points: TrendPoint[] }) {
  const mounted = useSyncExternalStore(subscribeNoop, getTrue, getFalse)

  if (!mounted) {
    return <div className="h-52 w-full rounded-lg bg-surface/40" aria-hidden />
  }

  return (
    <div className="w-full" style={{ height: 208 }}>
      <ResponsiveContainer width="100%" height={208} minWidth={0}>
        <AreaChart data={points} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="ganadoFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="invertidoFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-muted)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--color-muted)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            minTickGap={48}
            tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
            tickFormatter={formatDateTick}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={44}
            tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => formatMinutesShort(v)}
          />
          <Tooltip
            cursor={{ stroke: 'var(--color-border)' }}
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              color: 'var(--color-text)',
              fontSize: 12,
            }}
            formatter={(value, name) => [
              formatMinutesShort(Number(value ?? 0)),
              name === 'ganado' ? 'Tiempo ganado' : 'Tiempo invertido',
            ]}
            labelFormatter={formatDateTick}
          />
          <Area
            type="monotone"
            dataKey="invertido"
            stroke="var(--color-muted)"
            strokeWidth={1.5}
            fill="url(#invertidoFill)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="ganado"
            stroke="var(--color-accent)"
            strokeWidth={2}
            fill="url(#ganadoFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-2 flex items-center gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full bg-accent" aria-hidden />
          Tiempo ganado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full bg-muted/60" aria-hidden />
          Tiempo invertido
        </span>
      </div>
    </div>
  )
}

function formatDateTick(value: unknown): string {
  const s = String(value ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return new Date(`${s}T00:00:00`).toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
  })
}

function formatMinutesShort(minutes: number): string {
  const m = Math.round(minutes)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}
