'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip, Legend, Cell } from 'recharts'

const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export type WeekDay = {
  date: string
  minutesStudy: number
  minutesWork: number
}

export function WeeklyChart({
  days,
  hasWork,
}: {
  days: WeekDay[]
  hasWork: boolean
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const data = days.map((d, i) => ({
    day: DAYS_ES[i],
    date: d.date,
    estudio: d.minutesStudy,
    trabajo: d.minutesWork,
    minutes: d.minutesStudy + d.minutesWork,
  }))

  if (!mounted) {
    return <div className="h-44 w-full rounded-lg bg-surface/40" aria-hidden />
  }

  const tooltipContentStyle = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    color: 'var(--color-text)',
    fontSize: 12,
  }

  if (!hasWork) {
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
              contentStyle={tooltipContentStyle}
              formatter={(value) => [`${value ?? 0} min`, '']}
              labelFormatter={(label, payload) => {
                const date = payload?.[0]?.payload?.date
                return date
                  ? `${label} · ${new Date(date).toLocaleDateString('es', { day: 'numeric', month: 'short' })}`
                  : label
              }}
            />
            <Bar dataKey="estudio" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.estudio > 0 ? 'var(--color-accent)' : 'var(--color-surface-2)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // Modo con trabajo: barras apiladas estudio + trabajo
  return (
    <div className="w-full" style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height={200} minWidth={0}>
        <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-surface-2)' }}
            contentStyle={tooltipContentStyle}
            formatter={(value, name) => [`${value ?? 0} min`, name]}
            labelFormatter={(label, payload) => {
              const date = payload?.[0]?.payload?.date
              return date
                ? `${label} · ${new Date(date).toLocaleDateString('es', { day: 'numeric', month: 'short' })}`
                : label
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
          <Bar dataKey="estudio" stackId="time" fill="var(--color-accent)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="trabajo" stackId="time" fill="var(--color-streak, #f59e0b)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
