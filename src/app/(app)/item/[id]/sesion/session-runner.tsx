'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSessionAction } from '@/lib/actions/sessions'
import { formatTimer } from '@/lib/format'
import { Confetti } from '@/components/confetti'
import type { Highlight } from '@/lib/highlights'

type StepOption = {
  id: string
  name: string
  weight_pct: number
  is_done: boolean
}

type Props = {
  itemId: string
  itemTitle: string
  unitType: string
  unitLabelPlural: string
  currentUnits: number
  totalUnits: number
  steps: StepOption[]
}

export function SessionRunner({
  itemId,
  itemTitle,
  unitLabelPlural,
  currentUnits,
  totalUnits,
  steps,
}: Props) {
  const router = useRouter()
  const [startedAt] = useState(() => new Date().toISOString())
  const startMs = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const pauseStart = useRef<number | null>(null)
  const accumulatedPaused = useRef(0)

  const [phase, setPhase] = useState<'running' | 'capture' | 'done'>('running')
  const [targetUnits, setTargetUnits] = useState<string>(String(currentUnits))
  const [note, setNote] = useState('')
  const [selectedStepId, setSelectedStepId] = useState<string>('')
  const [completeStep, setCompleteStep] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [celebrationTier, setCelebrationTier] = useState<'small' | 'medium' | 'large' | null>(null)
  const [highlight, setHighlight] = useState<Highlight | null>(null)
  const [itemCompleted, setItemCompleted] = useState(false)

  const hasSteps = steps.length > 0
  const pendingSteps = steps.filter((s) => !s.is_done)

  useEffect(() => {
    if (phase !== 'running') return
    const tick = () => {
      if (!paused) {
        setElapsed(Math.floor((Date.now() - startMs.current - accumulatedPaused.current) / 1000))
      }
    }
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [phase, paused])

  const handlePauseToggle = () => {
    if (!paused) {
      pauseStart.current = Date.now()
      setPaused(true)
    } else {
      if (pauseStart.current) {
        accumulatedPaused.current += Date.now() - pauseStart.current
        pauseStart.current = null
      }
      setPaused(false)
    }
  }

  const handleFinish = () => {
    if (pauseStart.current) {
      accumulatedPaused.current += Date.now() - pauseStart.current
      pauseStart.current = null
      setPaused(false)
    }
    setPhase('capture')
  }

  const handleSave = async () => {
    setError(null)
    setSubmitting(true)
    const reachedNum = Number(targetUnits)
    const delta = Number.isFinite(reachedNum) ? reachedNum - currentUnits : 0
    if (delta < 0) {
      setError('Ese número es menor al que tenías. ¿Querés ajustarlo?')
      setSubmitting(false)
      return
    }
    const result = await createSessionAction({
      item_id: itemId,
      started_at: startedAt,
      duration_seconds: Math.max(0, Math.min(86400, elapsed)),
      units_progressed: delta,
      note: note.trim() || undefined,
      step_id: selectedStepId || undefined,
      complete_step: selectedStepId ? completeStep : undefined,
    })
    if ('error' in result) {
      setError(result.error)
      setSubmitting(false)
      return
    }
    setCelebrationTier(result.itemCompleted ? 'large' : delta > 0 || completeStep ? 'medium' : 'small')
    setHighlight(result.highlight)
    setItemCompleted(result.itemCompleted)
    setPhase('done')

    if (result.itemCompleted) {
      setTimeout(() => {
        router.push(`/item/${itemId}/completado`)
      }, 1200)
    } else {
      setTimeout(() => {
        router.push(`/item/${itemId}`)
        router.refresh()
      }, 2400)
    }
  }

  const handleCancel = () => {
    if (elapsed < 5) {
      router.push(`/item/${itemId}`)
      return
    }
    setPhase('capture')
  }

  if (phase === 'done') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto">
        <Confetti tier={celebrationTier ?? 'small'} trigger={celebrationTier} />
        <p className="text-4xl">{itemCompleted ? '✨' : '✓'}</p>
        <p className="text-2xl font-medium">
          {itemCompleted
            ? '¡Lo terminaste!'
            : celebrationTier === 'medium'
              ? 'Sesión guardada'
              : 'Cuenta igual'}
        </p>
        {highlight && highlight.text && (
          <p className="text-accent text-sm font-medium">{highlight.text}</p>
        )}
        <p className="text-muted text-xs">
          {itemCompleted ? 'Te llevamos a celebrarlo…' : 'Te llevamos al detalle…'}
        </p>
      </div>
    )
  }

  if (phase === 'capture') {
    return (
      <div className="space-y-6 max-w-md mx-auto">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-muted">Sesión terminada</p>
          <h1 className="text-xl font-semibold leading-snug">{itemTitle}</h1>
          <p className="text-sm text-muted tabular">{formatTimer(elapsed)}</p>
        </header>

        {hasSteps && (
          <div className="space-y-1.5">
            <label htmlFor="step" className="block text-sm text-muted">
              ¿En qué paso trabajaste?
            </label>
            <select
              id="step"
              value={selectedStepId}
              onChange={(e) => {
                setSelectedStepId(e.target.value)
                setCompleteStep(false)
              }}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 focus:border-accent focus:outline-none"
            >
              <option value="">— Sin paso —</option>
              {pendingSteps.length > 0 && (
                <optgroup label="Pendientes">
                  {pendingSteps.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.weight_pct}%)
                    </option>
                  ))}
                </optgroup>
              )}
              {steps.filter((s) => s.is_done).length > 0 && (
                <optgroup label="Ya completados">
                  {steps
                    .filter((s) => s.is_done)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        ✓ {s.name} ({s.weight_pct}%)
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
            {selectedStepId && (
              <label className="flex items-center gap-2 text-sm text-text pt-1">
                <input
                  type="checkbox"
                  checked={completeStep}
                  onChange={(e) => setCompleteStep(e.target.checked)}
                  className="w-4 h-4 accent-accent"
                />
                Marcar paso como completado
              </label>
            )}
          </div>
        )}

        {!hasSteps && (
          <div className="space-y-1.5">
            <label htmlFor="reached" className="block text-sm text-muted">
              Avancé hasta ({unitLabelPlural})
            </label>
            <input
              id="reached"
              type="number"
              min={currentUnits}
              max={totalUnits}
              step="any"
              value={targetUnits}
              onChange={(e) => setTargetUnits(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 focus:border-accent focus:outline-none tabular"
            />
            <p className="text-xs text-muted">
              Estabas en {currentUnits} de {totalUnits}.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="note" className="block text-sm text-muted">
            Nota <span className="text-muted/60">(opcional)</span>
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Qué quedó claro, qué te llamó la atención…"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 focus:border-accent focus:outline-none resize-none"
          />
        </div>

        {error && <p className="text-sm text-danger" role="alert">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className="rounded-lg bg-accent px-5 py-2.5 font-medium text-bg hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : 'Guardar sesión'}
          </button>
          <Link href={`/item/${itemId}`} className="text-sm text-muted hover:text-text">
            Descartar
          </Link>
        </div>
      </div>
    )
  }

  // phase === 'running'
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center space-y-8">
      <p className="text-sm text-muted max-w-xs">{itemTitle}</p>
      <p className="text-6xl sm:text-7xl font-light tabular">{formatTimer(elapsed)}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handlePauseToggle}
          className="rounded-lg border border-border bg-surface px-5 py-2.5 text-text hover:bg-surface-2"
        >
          {paused ? 'Reanudar' : 'Pausar'}
        </button>
        <button
          type="button"
          onClick={handleFinish}
          className="rounded-lg bg-accent px-5 py-2.5 font-medium text-bg hover:opacity-90"
        >
          Terminar
        </button>
      </div>
      <button
        type="button"
        onClick={handleCancel}
        className="text-xs text-muted hover:text-text"
      >
        Cancelar sesión
      </button>
    </div>
  )
}
