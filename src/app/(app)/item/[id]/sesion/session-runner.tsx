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
  position: number
  is_done: boolean
  parent_step_id: string | null
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

type Selection = { selected: boolean; complete: boolean }

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
  const [selections, setSelections] = useState<Record<string, Selection>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [celebrationTier, setCelebrationTier] = useState<'small' | 'medium' | 'large' | null>(null)
  const [highlight, setHighlight] = useState<Highlight | null>(null)
  const [itemCompleted, setItemCompleted] = useState(false)

  const hasSteps = steps.length > 0

  // Módulos raíz con al menos una tarea hija (is_done es derivado — no se puede completar manual)
  const moduleIds = new Set(steps.filter((s) => !s.parent_step_id).map((s) => s.id))
  const hasChildren = (id: string) => steps.some((s) => s.parent_step_id === id)

  // Ordena de forma jerárquica: módulos raíz por position, cada uno seguido de sus hijos por position.
  // Necesario porque DB ordena por position global y las tareas (position 1,2,3…)
  // siempre aparecen antes que sus módulos padre (position 11,12,13…).
  function hierarchicalOrder(subset: StepOption[]): StepOption[] {
    const subIds = new Set(subset.map((s) => s.id))
    const roots = subset
      .filter((s) => !s.parent_step_id)
      .sort((a, b) => a.position - b.position)
    const result: StepOption[] = []
    for (const root of roots) {
      result.push(root)
      const children = subset
        .filter((s) => s.parent_step_id === root.id)
        .sort((a, b) => a.position - b.position)
      result.push(...children)
    }
    // Tareas cuyo módulo padre NO está en el subset (padre ya completado u omitido):
    // añadirlas al final para que no queden silenciadas.
    const orphans = subset.filter(
      (s) => s.parent_step_id && !subIds.has(s.parent_step_id),
    )
    result.push(...orphans)
    return result
  }

  const pendingSteps = hierarchicalOrder(steps.filter((s) => !s.is_done))
  const doneSteps = hierarchicalOrder(steps.filter((s) => s.is_done))

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

    const selectedSteps = Object.entries(selections)
      .filter(([, s]) => s.selected)
      .map(([step_id, s]) => ({ step_id, complete: s.complete }))

    if (!hasSteps) {
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
      })
      if ('error' in result) { setError(result.error); setSubmitting(false); return }
      finishSession(result, delta > 0, false)
      return
    }

    const anyComplete = selectedSteps.some((s) => s.complete)
    const result = await createSessionAction({
      item_id: itemId,
      started_at: startedAt,
      duration_seconds: Math.max(0, Math.min(86400, elapsed)),
      units_progressed: 0,
      note: note.trim() || undefined,
      steps: selectedSteps,
    })
    if ('error' in result) { setError(result.error); setSubmitting(false); return }
    finishSession(result, false, anyComplete)
  }

  const finishSession = (
    result: { ok: true; itemCompleted: boolean; sessionId: string; highlight: Highlight },
    hadUnits: boolean,
    hadComplete: boolean,
  ) => {
    setCelebrationTier(result.itemCompleted ? 'large' : hadUnits || hadComplete ? 'medium' : 'small')
    setHighlight(result.highlight)
    setItemCompleted(result.itemCompleted)
    setPhase('done')

    if (result.itemCompleted) {
      setTimeout(() => router.push(`/item/${itemId}/completado`), 1200)
    } else {
      setTimeout(() => { router.push(`/item/${itemId}`); router.refresh() }, 2400)
    }
  }

  const handleCancel = () => {
    if (elapsed < 5) { router.push(`/item/${itemId}`); return }
    setPhase('capture')
  }

  const toggleSelected = (stepId: string) => {
    setSelections((prev) => {
      const cur = prev[stepId] ?? { selected: false, complete: false }
      return { ...prev, [stepId]: { selected: !cur.selected, complete: !cur.selected ? cur.complete : false } }
    })
  }

  const toggleComplete = (stepId: string) => {
    setSelections((prev) => {
      const cur = prev[stepId] ?? { selected: true, complete: false }
      return { ...prev, [stepId]: { ...cur, complete: !cur.complete } }
    })
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
            <p className="block text-sm text-muted">¿En qué pasos trabajaste?</p>
            <div className="rounded-lg border border-border bg-surface divide-y divide-border">
              {pendingSteps.length > 0 && (
                <div>
                  <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                    Pendientes
                  </p>
                  {pendingSteps.map((step) => (
                    <StepRow
                      key={step.id}
                      step={step}
                      selection={selections[step.id] ?? { selected: false, complete: false }}
                      isChildless={moduleIds.has(step.id) ? !hasChildren(step.id) : true}
                      isIndented={Boolean(step.parent_step_id)}
                      isAlreadyDone={false}
                      onToggleSelected={() => toggleSelected(step.id)}
                      onToggleComplete={() => toggleComplete(step.id)}
                    />
                  ))}
                </div>
              )}
              {doneSteps.length > 0 && (
                <div>
                  <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                    Ya completados
                  </p>
                  {doneSteps.map((step) => (
                    <StepRow
                      key={step.id}
                      step={step}
                      selection={selections[step.id] ?? { selected: false, complete: false }}
                      isChildless={moduleIds.has(step.id) ? !hasChildren(step.id) : true}
                      isIndented={Boolean(step.parent_step_id)}
                      isAlreadyDone={true}
                      onToggleSelected={() => toggleSelected(step.id)}
                      onToggleComplete={() => toggleComplete(step.id)}
                    />
                  ))}
                </div>
              )}
            </div>
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

function StepRow({
  step,
  selection,
  isChildless,
  isIndented,
  isAlreadyDone,
  onToggleSelected,
  onToggleComplete,
}: {
  step: StepOption
  selection: Selection
  isChildless: boolean
  isIndented: boolean
  isAlreadyDone: boolean
  onToggleSelected: () => void
  onToggleComplete: () => void
}) {
  const canComplete = isChildless && !isAlreadyDone
  const isCompleted = selection.complete && canComplete

  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 ${isIndented ? 'pl-7' : ''}`}>
      <input
        type="checkbox"
        checked={selection.selected}
        onChange={onToggleSelected}
        className="w-4 h-4 shrink-0 accent-accent"
      />
      <span
        className={`flex-1 text-sm leading-snug transition-all ${
          isCompleted
            ? 'line-through opacity-50'
            : isAlreadyDone
              ? 'text-muted'
              : 'text-text'
        }`}
      >
        {isAlreadyDone && '✓ '}{step.name}
      </span>

      {selection.selected && (
        <>
          {canComplete ? (
            <label className="flex items-center gap-1.5 text-xs text-muted shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={selection.complete}
                onChange={onToggleComplete}
                className="w-3.5 h-3.5 accent-accent"
              />
              Terminé
            </label>
          ) : !isAlreadyDone ? (
            <span
              className="text-xs text-muted/60 shrink-0"
              title="Se completa cuando termines todas sus tareas"
            >
              (se completa con sus tareas)
            </span>
          ) : null}
        </>
      )}
    </div>
  )
}
