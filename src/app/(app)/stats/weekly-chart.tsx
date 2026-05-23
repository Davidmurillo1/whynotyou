'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts'

const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function WeeklyChart({ days }: { days: { date: string; minutes: number }[] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const data = days.map((d, i) => ({
    day: DAYS_ES[i],
    minutes: d.minutes,
    date: d.date,
  }))

  if (!mounted) {
    return <div className="h-44 w-full rounded-lg bg-surface/40" aria-hidden />
  }

  return (
    <div className="w-full" style={{ height: 176 }}>
      <ResponsiveContainer width="100%" height={176} minWidth={0}>
        <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-surface-2)' }}
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              color: 'var(--color-text)',
              fontSize: 12,
            }}
            formatter={(value) => [`${value ?? 0} min`, '']}
            labelFormatter={(label, payload) => {
              const date = payload?.[0]?.payload?.date
              return date ? `${label} · ${new Date(date).toLocaleDateString('es', { day: 'numeric', month: 'short' })}` : label
            }}
          />
          <Bar dataKey="minutes" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={d.minutes > 0 ? 'var(--color-accent)' : 'var(--color-surface-2)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
