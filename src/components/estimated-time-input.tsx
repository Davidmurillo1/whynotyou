'use client'

import { useState } from 'react'

/**
 * Campo "Tiempo estimado" con inputs de horas y minutos que se materializa
 * en un único valor en minutos (input hidden `name`), listo para FormData.
 *
 * - `defaultMinutes`: valor inicial (null = sin estimación).
 * - `onChange`: callback opcional con el total en minutos (null = vacío).
 * - `compact`: variante inline chica para el editor de pasos.
 */
export function EstimatedTimeInput({
  name = 'estimated_minutes',
  defaultMinutes = null,
  onChange,
  compact = false,
  label = 'Tiempo estimado',
  optional = true,
  hint,
}: {
  name?: string
  defaultMinutes?: number | null
  onChange?: (minutes: number | null) => void
  compact?: boolean
  label?: string
  optional?: boolean
  hint?: string
}) {
  const initialH = defaultMinutes != null ? Math.floor(defaultMinutes / 60) : null
  const initialM = defaultMinutes != null ? defaultMinutes % 60 : null
  const [hours, setHours] = useState<string>(initialH ? String(initialH) : '')
  const [minutes, setMinutes] = useState<string>(initialM ? String(initialM) : '')

  const h = parsePart(hours)
  const m = parsePart(minutes)
  const total = h * 60 + m
  const value = total > 0 ? String(total) : ''

  const update = (nextHours: string, nextMinutes: string) => {
    setHours(nextHours)
    setMinutes(nextMinutes)
    const nextTotal = parsePart(nextHours) * 60 + parsePart(nextMinutes)
    onChange?.(nextTotal > 0 ? nextTotal : null)
  }

  const fieldCls = compact
    ? 'w-14 rounded-md border border-border bg-surface-2 px-2 py-1 text-center text-xs text-text placeholder:text-muted/50 focus:border-accent focus:outline-none'
    : 'w-20 rounded-lg border border-border bg-surface px-3 py-2.5 text-center text-text placeholder:text-muted/60 focus:border-accent focus:outline-none'

  return (
    <div className={compact ? 'inline-flex items-center gap-1.5' : 'space-y-1.5'}>
      {!compact && (
        <span className="block text-sm text-muted">
          {label} {optional && <span className="text-muted/60">(opcional)</span>}
        </span>
      )}
      <input type="hidden" name={name} value={value} />
      <div className={compact ? 'contents' : 'flex items-center gap-2'}>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={1666}
          step={1}
          value={hours}
          onChange={(e) => update(e.target.value, minutes)}
          placeholder="0"
          aria-label={`${label}: horas`}
          className={fieldCls}
        />
        <span className={compact ? 'text-[10px] text-muted' : 'text-sm text-muted'}>h</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={59}
          step={1}
          value={minutes}
          onChange={(e) => update(hours, e.target.value)}
          placeholder="0"
          aria-label={`${label}: minutos`}
          className={fieldCls}
        />
        <span className={compact ? 'text-[10px] text-muted' : 'text-sm text-muted'}>min</span>
      </div>
      {!compact && hint && <p className="text-xs text-muted/80">{hint}</p>}
    </div>
  )
}

/** Sanitiza una parte (horas o minutos): entero ≥ 0, vacío/no numérico = 0. */
function parsePart(raw: string): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n > 0 ? n : 0
}
