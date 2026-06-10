'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSessionAction, getSessionHighlightAction } from '@/lib/actions/sessions'
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

type Phase = 'running' | 'capture' | 'done'

type PersistedSession = {
  startedAt: string
  accumulatedPausedMs: number
  lastTickAt: number
  phase: 'running' | 'capture'
  selections: Record<string, Selection>
  note: string
  targetUnits: string
}

const STORAGE_KEY = (itemId: string) => `sl:session:${itemId}`
const RECOVERY_MAX_AGE_MS = 24 * 60 * 60 * 1000
const SAVE_TIMEOUT_MS = 30_000
const PERSIST_INTERVAL_MS = 5_000

function readPersisted(itemId: string): PersistedSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY(itemId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedSession
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.startedAt !== 'string' ||
      typeof parsed.lastTickAt !== 'number'
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writePersisted(itemId: string, data: PersistedSession): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY(itemId), JSON.stringify(data))
  } catch {
    // localStorage deshabilitado o cuota llena — degradamos silenciosamente.
  }
}

function clearPersisted(itemId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY(itemId))
  } catch {
    // Idem
  }
}

function formatMinutesAgo(timestamp: number): string {
  const diffMin = Math.max(1, Math.round((Date.now() - timestamp) / 60_000))
  if (diffMin < 60) return `${diffMin} min`
  const hours = Math.floor(diffMin / 60)
  const mins = diffMin % 60
  if (mins === 0) return `${hours} h`
  return `${hours} h ${mins} min`
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
  const [startedAt, setStartedAt] = useState<string>(() => new Date().toISOString())
  const startMs = useRef<number>(0)
  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const pauseStart = useRef<number | null>(null)
  const accumulatedPaused = useRef(0)

  const [phase, setPhase] = useState<Phase>('running')
  const [targetUnits, setTargetUnits] = useState<string>(String(currentUnits))
  const [note, setNote] = useState('')
  const [selections, setSelections] = useState<Record<string, Selection>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [celebrationTier, setCelebrationTier] = useState<'small' | 'medium' | 'large' | null>(null)
  const [highlight, setHighlight] = useState<Highlight | null>(null)
  const [itemCompleted, setItemCompleted] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)

  // External store: leemos localStorage una vez (lazy) y notificamos cambios
  // sin pasar por setState-en-effect. Esto evita hydration mismatch porque
  // getServerSnapshot devuelve null (mismo HTML inicial server/cliente).
  const recoveryAPI = useMemo(() => {
    const store: {
      cache: PersistedSession | null
      initialized: boolean
      listeners: Set<() => void>
    } = {
      cache: null,
      initialized: false,
      listeners: new Set(),
    }
    return {
      getSnapshot: (): PersistedSession | null => {
        if (!store.initialized) {
          store.initialized = true
          if (typeof window !== 'undefined') {
            const p = readPersisted(itemId)
            if (p && Date.now() - p.lastTickAt <= RECOVERY_MAX_AGE_MS) {
              store.cache = p
            } else if (p) {
              clearPersisted(itemId)
            }
          }
        }
        return store.cache
      },
      getServerSnapshot: (): PersistedSession | null => null,
      subscribe: (cb: () => void) => {
        store.listeners.add(cb)
        return () => {
          store.listeners.delete(cb)
        }
      },
      discard: () => {
        store.cache = null
        store.listeners.forEach((l) => l())
      },
    }
  }, [itemId])

  const pendingRecovery = useSyncExternalStore(
    recoveryAPI.subscribe,
    recoveryAPI.getSnapshot,
    recoveryAPI.getServerSnapshot,
  )

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

  // Init: sincronizar startMs.current con startedAt (puro, no usa Date.now en render).
  useEffect(() => {
    startMs.current = Date.parse(startedAt)
  }, [startedAt])

  // Tick del cronómetro (solo elapsed; deps mínimas).
  // Pausa mientras hay un banner de recuperación activo: el usuario debe decidir primero.
  useEffect(() => {
    if (phase !== 'running') return
    if (pendingRecovery) return
    const tick = () => {
      if (!paused) {
        setElapsed(Math.floor((Date.now() - startMs.current - accumulatedPaused.current) / 1000))
      }
    }
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [phase, paused, pendingRecovery])

  // Ref con el estado más reciente para flush periódico sin recrear el interval.
  // Se actualiza vía effect (no en render) para respetar la regla de refs.
  const latestStateRef = useRef({
    startedAt,
    selections,
    note,
    targetUnits,
    phase: phase as 'running' | 'capture',
    paused,
  })
  useEffect(() => {
    latestStateRef.current = {
      startedAt,
      selections,
      note,
      targetUnits,
      phase: phase === 'done' ? 'capture' : phase,
      paused,
    }
  })

  // Flush periódico a localStorage mientras la sesión está activa.
  // No flushea mientras el banner de recuperación está activo, para no sobrescribir
  // la entrada que el usuario aún no decidió si recuperar o descartar.
  useEffect(() => {
    if (phase === 'done') return
    if (pendingRecovery) return
    const flush = () => {
      const now = Date.now()
      const s = latestStateRef.current
      const liveAccum =
        accumulatedPaused.current +
        (s.paused && pauseStart.current ? now - pauseStart.current : 0)
      writePersisted(itemId, {
        startedAt: s.startedAt,
        accumulatedPausedMs: liveAccum,
        lastTickAt: now,
        phase: s.phase,
        selections: s.selections,
        note: s.note,
        targetUnits: s.targetUnits,
      })
    }
    const id = setInterval(flush, PERSIST_INTERVAL_MS)
    // Primer flush rápido para asegurar respaldo temprano (al ~1s).
    const initId = setTimeout(flush, 1_000)
    return () => {
      clearInterval(id)
      clearTimeout(initId)
    }
  }, [phase, itemId, pendingRecovery])

  const persistNow = () => {
    if (phase === 'done') return
    const now = Date.now()
    const s = latestStateRef.current
    const liveAccum =
      accumulatedPaused.current +
      (s.paused && pauseStart.current ? now - pauseStart.current : 0)
    writePersisted(itemId, {
      startedAt: s.startedAt,
      accumulatedPausedMs: liveAccum,
      lastTickAt: now,
      phase: s.phase,
      selections: s.selections,
      note: s.note,
      targetUnits: s.targetUnits,
    })
  }

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
    persistNow()
  }

  const handleFinish = () => {
    if (pauseStart.current) {
      accumulatedPaused.current += Date.now() - pauseStart.current
      pauseStart.current = null
      setPaused(false)
    }
    setPhase('capture')
    // persistNow corre con phase=running todavía (closure); el interval lo actualizará a 'capture' en el próximo flush.
    persistNow()
  }

  const handleRecover = () => {
    if (!pendingRecovery) return
    const p = pendingRecovery
    const recoveredStartMs = Date.parse(p.startedAt)
    // Mantener elapsed previo: descontar como pausa el tiempo entre lastTickAt y ahora.
    accumulatedPaused.current = p.accumulatedPausedMs + (Date.now() - p.lastTickAt)
    const elapsedMs = Math.max(0, p.lastTickAt - recoveredStartMs - p.accumulatedPausedMs)
    pauseStart.current = null
    setStartedAt(p.startedAt)
    setElapsed(Math.floor(elapsedMs / 1000))
    setSelections(p.selections ?? {})
    setNote(p.note ?? '')
    setTargetUnits(p.targetUnits ?? String(currentUnits))
    setPaused(false)
    setPhase(p.phase)
    recoveryAPI.discard()
  }

  const handleDiscardRecovery = () => {
    clearPersisted(itemId)
    recoveryAPI.discard()
  }

  const handleSave = async () => {
    setError(null)
    setSubmitting(true)
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), SAVE_TIMEOUT_MS)

    try {
      const selectedSteps = Object.entries(selections)
        .filter(([, s]) => s.selected)
        .map(([step_id, s]) => ({ step_id, complete: s.complete }))

      let result: Awaited<ReturnType<typeof createSessionAction>>
      let hadUnits = false
      let hadComplete = false

      if (!hasSteps) {
        const reachedNum = Number(targetUnits)
        const delta = Number.isFinite(reachedNum) ? reachedNum - currentUnits : 0
        if (delta < 0) {
          setError('Ese número es menor al que tenías. ¿Querés ajustarlo?')
          return
        }
        hadUnits = delta > 0
        const actionPromise = createSessionAction({
          item_id: itemId,
          started_at: startedAt,
          duration_seconds: Math.max(0, Math.min(86400, elapsed)),
          units_progressed: delta,
          note: note.trim() || undefined,
        })
        result = await Promise.race([
          actionPromise,
          new Promise<never>((_, reject) => {
            ctrl.signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'))
            })
          }),
        ])
      } else {
        hadComplete = selectedSteps.some((s) => s.complete)
        const actionPromise = createSessionAction({
          item_id: itemId,
          started_at: startedAt,
          duration_seconds: Math.max(0, Math.min(86400, elapsed)),
          units_progressed: 0,
          note: note.trim() || undefined,
          steps: selectedSteps,
        })
        result = await Promise.race([
          actionPromise,
          new Promise<never>((_, reject) => {
            ctrl.signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'))
            })
          }),
        ])
      }

      if ('error' in result) {
        setError(result.error)
        return
      }

      clearPersisted(itemId)
      finishSession(result, hadUnits, hadComplete)
    } catch (e) {
      const isAbort =
        (e instanceof DOMException && e.name === 'AbortError') ||
        (e instanceof Error && e.name === 'AbortError')
      if (isAbort) {
        setError('Tardó demasiado. Tu tiempo está guardado, podés reintentar.')
      } else {
        setError('Hubo un problema. Tu tiempo está guardado, podés reintentar.')
      }
    } finally {
      clearTimeout(timeoutId)
      setSubmitting(false)
    }
  }

  const finishSession = (
    result: { ok: true; itemCompleted: boolean; sessionId: string },
    hadUnits: boolean,
    hadComplete: boolean,
  ) => {
    setCelebrationTier(result.itemCompleted ? 'large' : hadUnits || hadComplete ? 'medium' : 'small')
    setHighlight(null)
    setItemCompleted(result.itemCompleted)
    setSessionId(result.sessionId)
    setPhase('done')

    if (result.itemCompleted) {
      setTimeout(() => router.push(`/item/${itemId}/completado`), 1200)
    } else {
      setTimeout(() => {
        router.push(`/item/${itemId}`)
        router.refresh()
      }, 2400)
    }
  }

  // En la pantalla `done`, cargar el highlight en una segunda request (no bloquea el guardado).
  useEffect(() => {
    if (phase !== 'done' || !sessionId) return
    let cancelled = false
    getSessionHighlightAction(sessionId).then((res) => {
      if (cancelled) return
      if ('ok' in res) setHighlight(res.highlight)
    })
    return () => {
      cancelled = true
    }
  }, [phase, sessionId])

  const handleCancel = () => {
    if (elapsed < 5) {
      clearPersisted(itemId)
      router.push(`/item/${itemId}`)
      return
    }
    setPhase('capture')
    persistNow()
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
          <Link
            href={`/item/${itemId}`}
            onClick={() => clearPersisted(itemId)}
            className="text-sm text-muted hover:text-text"
          >
            Descartar
          </Link>
        </div>
      </div>
    )
  }

  // phase === 'running'
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center space-y-8">
      {pendingRecovery && (
        <div className="rounded-lg border border-border bg-surface p-4 max-w-md w-full mx-auto space-y-3 text-left">
          <p className="text-sm text-text">
            Hay una sesión sin guardar de hace{' '}
            <span className="font-medium">{formatMinutesAgo(pendingRecovery.lastTickAt)}</span>.{' '}
            ¿Querés recuperarla?
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRecover}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
            >
              Recuperar
            </button>
            <button
              type="button"
              onClick={handleDiscardRecovery}
              className="text-sm text-muted hover:text-text"
            >
              Descartar
            </button>
          </div>
        </div>
      )}
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
