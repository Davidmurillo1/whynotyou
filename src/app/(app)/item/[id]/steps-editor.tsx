'use client'

import { useState, useTransition } from 'react'
import {
  createStepAction,
  updateStepAction,
  toggleStepAction,
  reorderStepsAction,
  deleteStepAction,
} from '@/lib/actions/steps'
import { normalizeStepsWeightsAction } from '@/lib/actions/item-weight-mode'
import {
  computeStepProgress,
  isStepEffectivelyDone,
  type ProgressMode,
  type StepsWeightMode,
} from '@/lib/items/progress'

export type Step = {
  id: string
  name: string
  weight_pct: number
  position: number
  is_done: boolean
  parent_step_id: string | null
  progress_mode: ProgressMode
}

/** Tolerancia para considerar la suma "= 100" frente a errores de redondeo
 *  acumulados (e.g. 33.33 + 33.33 + 33.34 = 100.00 exacto, pero
 *  33.3 + 33.3 + 33.4 = 100.0 también). */
const SUM_EPSILON = 0.01

const inputCls =
  'rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted/60 focus:border-accent focus:outline-none'

/**
 * Componente *controlled*: el state de `steps` vive en el padre. Esto permite
 * que el header del ítem (ProgressRing, contador "X de Y módulos") refleje
 * cambios instantáneamente sin un `router.refresh()` que dispare re-queries.
 *
 * Las server actions hacen `revalidatePath` para que otras rutas (/dashboard,
 * /biblioteca, /stats) queden frescas en la próxima navegación — pero no hace
 * falta forzar refresh del cliente actual.
 */
export function StepsEditor({
  itemId,
  steps,
  setSteps,
  weightMode,
  onWeightModeChange,
}: {
  itemId: string
  steps: Step[]
  setSteps: React.Dispatch<React.SetStateAction<Step[]>>
  weightMode: StepsWeightMode
  onWeightModeChange: (mode: StepsWeightMode) => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const roots = steps.filter((s) => !s.parent_step_id)
  const childrenOf = (rootId: string) =>
    steps.filter((s) => s.parent_step_id === rootId).sort((a, b) => a.position - b.position)

  const rootsDone = roots.filter((r) => isStepEffectivelyDone(r, steps)).length

  // Subtítulo del editor. En 'equal' ignoramos los pesos: cada módulo aporta 1/n.
  // En 'custom' usamos la suma ponderada como hasta ahora.
  let progressPct = 0
  let totalRootWeight = 0
  if (roots.length > 0) {
    if (weightMode === 'equal') {
      const sum = roots.reduce((acc, r) => acc + computeStepProgress(r, steps), 0)
      progressPct = Math.round((sum / roots.length) * 100)
    } else {
      totalRootWeight = roots.reduce((acc, r) => acc + r.weight_pct, 0)
      const accumulatedWeight = roots.reduce(
        (acc, r) => acc + r.weight_pct * computeStepProgress(r, steps),
        0,
      )
      progressPct =
        totalRootWeight > 0 ? Math.round((accumulatedWeight / totalRootWeight) * 100) : 0
    }
  }

  // En 'custom', cuánto suman los pesos en este momento. Es solo señal visual.
  const customSum = roots.reduce((acc, r) => acc + r.weight_pct, 0)
  const sumIsCorrect = Math.abs(customSum - 100) < SUM_EPSILON
  const showCustomSumBanner = weightMode === 'custom' && roots.length > 0 && !sumIsCorrect

  const handleNormalize = () => {
    setError(null)
    startTransition(async () => {
      const result = await normalizeStepsWeightsAction({ item_id: itemId })
      if ('error' in result) {
        setError(result.error)
        return
      }
      // Aplicar los nuevos pesos al state local.
      const byId = new Map(result.weights.map((w) => [w.id, w.weight_pct]))
      setSteps((prev) =>
        prev.map((s) => (byId.has(s.id) ? { ...s, weight_pct: byId.get(s.id)! } : s)),
      )
    })
  }

  const handleToggle = (step: Step) => {
    const hasChildren = steps.some((s) => s.parent_step_id === step.id)
    if (hasChildren) {
      setError('Este módulo se completa solo cuando todas sus tareas estén marcadas.')
      return
    }
    setError(null)
    setSteps((prev) =>
      prev.map((s) => (s.id === step.id ? { ...s, is_done: !s.is_done } : s)),
    )
    startTransition(async () => {
      const result = await toggleStepAction({ id: step.id, is_done: !step.is_done })
      if ('error' in result) {
        setError(result.error)
        setSteps((prev) =>
          prev.map((s) => (s.id === step.id ? { ...s, is_done: step.is_done } : s)),
        )
      }
    })
  }

  const handleDelete = (step: Step) => {
    setError(null)
    const isRoot = !step.parent_step_id
    const hasChildren = isRoot && childrenOf(step.id).length > 0
    if (hasChildren) {
      const ok = window.confirm(
        `"${step.name}" tiene tareas. Si lo borrás, las tareas también se eliminan. ¿Seguís?`,
      )
      if (!ok) return
    } else if (isRoot && roots.length === 1) {
      const ok = window.confirm(
        'Vas a borrar el último módulo. El progreso del ítem va a volver a calcularse por unidades. ¿Seguís?',
      )
      if (!ok) return
    }
    // Optimismo: lo sacamos ya del state local
    const snapshot = steps
    setSteps((prev) =>
      prev.filter((s) => s.id !== step.id && s.parent_step_id !== step.id),
    )
    startTransition(async () => {
      const result = await deleteStepAction({ id: step.id })
      if ('error' in result) {
        setError(result.error)
        setSteps(snapshot)
      }
    })
  }

  const handleMoveRoot = (step: Step, dir: -1 | 1) => {
    const idx = roots.findIndex((s) => s.id === step.id)
    const target = idx + dir
    if (target < 0 || target >= roots.length) return
    const next = [...roots]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    const order = next.map((s, i) => ({ id: s.id, position: i }))
    setSteps((prev) =>
      prev.map((s) => {
        const found = next.findIndex((n) => n.id === s.id)
        return found >= 0 ? { ...s, position: found } : s
      }),
    )
    startTransition(async () => {
      const result = await reorderStepsAction({ item_id: itemId, order })
      if ('error' in result) setError(result.error)
    })
  }

  const handleRename = (step: Step, name: string) => {
    if (name.trim() === step.name) return
    setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, name: name.trim() } : s)))
    startTransition(async () => {
      const result = await updateStepAction({ id: step.id, name: name.trim() })
      if ('error' in result) {
        setError(result.error)
      }
    })
  }

  const handleWeight = (step: Step, weight: number) => {
    if (weight === step.weight_pct) return
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
      setError('El peso tiene que ser mayor que 0 y hasta 100.')
      return
    }
    setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, weight_pct: weight } : s)))
    startTransition(async () => {
      const result = await updateStepAction({ id: step.id, weight_pct: weight })
      if ('error' in result) {
        setError(result.error)
      }
    })
  }

  const handleProgressMode = (step: Step, mode: ProgressMode) => {
    if (mode === step.progress_mode) return
    setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, progress_mode: mode } : s)))
    startTransition(async () => {
      const result = await updateStepAction({ id: step.id, progress_mode: mode })
      if ('error' in result) {
        setError(result.error)
        setSteps((prev) =>
          prev.map((s) => (s.id === step.id ? { ...s, progress_mode: step.progress_mode } : s)),
        )
      }
    })
  }

  return (
    <div className="space-y-4">
      {roots.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted">
            {rootsDone} de {roots.length} módulos completados · {progressPct}%
            {weightMode === 'custom' && <> del peso total</>}
          </p>
          <WeightModeToggle
            mode={weightMode}
            onChange={onWeightModeChange}
            disabled={pending}
          />
        </div>
      )}

      {showCustomSumBanner && (
        <div
          className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs"
          role="status"
        >
          <span className="text-amber-200">
            Tus pesos suman {formatWeight(customSum)} (debería ser 100). El progreso se calcula
            proporcional.
          </span>
          <button
            type="button"
            onClick={handleNormalize}
            disabled={pending}
            className="rounded-md border border-amber-500/40 px-2 py-1 text-amber-200 hover:bg-amber-500/15 disabled:opacity-50"
          >
            Normalizar a 100
          </button>
        </div>
      )}

      {roots.length === 0 && (
        <NewStepForm
          itemId={itemId}
          startTransition={startTransition}
          pending={pending}
          setError={setError}
          onCreated={(created) => setSteps((prev) => [...prev, created])}
          weightMode={weightMode}
          firstOne
        />
      )}

      {roots.length > 0 && (
        <ul className="space-y-2">
          {roots.map((module, idx) => (
            <ModuleRow
              key={module.id}
              module={module}
              tasks={childrenOf(module.id)}
              allSteps={steps}
              isFirst={idx === 0}
              isLast={idx === roots.length - 1}
              pending={pending}
              weightMode={weightMode}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onMove={handleMoveRoot}
              onRename={handleRename}
              onWeight={handleWeight}
              onProgressMode={handleProgressMode}
              itemId={itemId}
              startTransition={startTransition}
              setError={setError}
              setSteps={setSteps}
            />
          ))}
        </ul>
      )}

      {roots.length > 0 && weightMode === 'custom' && (
        <p
          className={`text-xs tabular ${sumIsCorrect ? 'text-muted' : 'text-amber-300'}`}
          aria-live="polite"
        >
          Suma actual: {formatWeight(customSum)} / 100
        </p>
      )}

      {roots.length > 0 && (
        <NewStepForm
          itemId={itemId}
          startTransition={startTransition}
          pending={pending}
          setError={setError}
          onCreated={(created) => setSteps((prev) => [...prev, created])}
          weightMode={weightMode}
        />
      )}

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** Redondea a 2 decimales sin mostrar `.00` cuando no hace falta. */
function formatWeight(n: number): string {
  const rounded = Math.round(n * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, '')
}

function ModuleRow({
  module,
  tasks,
  allSteps,
  isFirst,
  isLast,
  pending,
  weightMode,
  onToggle,
  onDelete,
  onMove,
  onRename,
  onWeight,
  onProgressMode,
  itemId,
  startTransition,
  setError,
  setSteps,
}: {
  module: Step
  tasks: Step[]
  allSteps: Step[]
  isFirst: boolean
  isLast: boolean
  pending: boolean
  weightMode: StepsWeightMode
  onToggle: (s: Step) => void
  onDelete: (s: Step) => void
  onMove: (s: Step, dir: -1 | 1) => void
  onRename: (s: Step, name: string) => void
  onWeight: (s: Step, weight: number) => void
  onProgressMode: (s: Step, mode: ProgressMode) => void
  itemId: string
  startTransition: (cb: () => void) => void
  setError: (e: string | null) => void
  setSteps: React.Dispatch<React.SetStateAction<Step[]>>
}) {
  const hasChildren = tasks.length > 0
  const moduleProgress = computeStepProgress(module, allSteps)
  const modulePct = Math.round(moduleProgress * 100)
  const effectivelyDone = isStepEffectivelyDone(module, allSteps)
  const [showTaskForm, setShowTaskForm] = useState(false)

  return (
    <li className="rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <input
          type="checkbox"
          checked={effectivelyDone}
          onChange={() => onToggle(module)}
          disabled={pending || hasChildren}
          className="w-4 h-4 accent-accent shrink-0 disabled:opacity-50"
          aria-label={`Marcar "${module.name}" como completado`}
          title={hasChildren ? 'Estado derivado de las tareas hijas' : undefined}
        />
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <input
            type="text"
            defaultValue={module.name}
            maxLength={120}
            onBlur={(e) => onRename(module, e.target.value)}
            className={`${inputCls} flex-1 min-w-0 ${effectivelyDone ? 'line-through text-muted' : ''}`}
          />
          {weightMode === 'custom' && (
            <div className="flex items-center gap-1 shrink-0">
              <input
                // `key` fuerza remontar el input cuando el peso cambia desde
                // fuera (ej. tras "Normalizar a 100"). Sin esto, defaultValue
                // solo se aplica al primer render y la UI queda desactualizada
                // hasta refrescar la página.
                key={module.weight_pct}
                type="number"
                min={0.01}
                max={100}
                step="any"
                defaultValue={module.weight_pct}
                onBlur={(e) => onWeight(module, Number(e.target.value))}
                className={`${inputCls} w-20 text-right tabular`}
                aria-label="Peso porcentual del módulo"
              />
              <span className="text-xs text-muted">%</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onMove(module, -1)}
            disabled={pending || isFirst}
            aria-label="Subir módulo"
            className="text-muted hover:text-text disabled:opacity-30 px-1"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(module, 1)}
            disabled={pending || isLast}
            aria-label="Bajar módulo"
            className="text-muted hover:text-text disabled:opacity-30 px-1"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => onDelete(module)}
            disabled={pending}
            aria-label="Eliminar módulo"
            className="text-muted hover:text-danger px-1"
          >
            ×
          </button>
        </div>
      </div>

      {hasChildren && (
        <div className="px-3 pb-1 -mt-1 space-y-1.5">
          <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${modulePct}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted">
              {tasks.filter((c) => c.is_done).length} de {tasks.length} tareas · {modulePct}%
            </p>
            <ProgressModeToggle
              mode={module.progress_mode}
              onChange={(mode) => onProgressMode(module, mode)}
              disabled={pending}
            />
          </div>
        </div>
      )}

      {(hasChildren || showTaskForm) && (
        <ul className="space-y-1.5 pl-9 pr-3 pb-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface-2/40 px-2.5 py-1.5"
            >
              <input
                type="checkbox"
                checked={task.is_done}
                onChange={() => onToggle(task)}
                disabled={pending}
                className="w-3.5 h-3.5 accent-accent shrink-0"
              />
              <input
                type="text"
                defaultValue={task.name}
                maxLength={120}
                onBlur={(e) => onRename(task, e.target.value)}
                className={`${inputCls} flex-1 min-w-0 py-1 text-xs ${task.is_done ? 'line-through text-muted' : ''}`}
              />
              {module.progress_mode === 'weighted' && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <input
                    type="number"
                    min={0.01}
                    max={100}
                    step="any"
                    defaultValue={task.weight_pct}
                    onBlur={(e) => onWeight(task, Number(e.target.value))}
                    className={`${inputCls} w-20 text-right text-xs py-1 tabular`}
                    aria-label="Peso de la tarea"
                  />
                  <span className="text-[11px] text-muted">%</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => onDelete(task)}
                disabled={pending}
                aria-label="Eliminar tarea"
                className="text-muted hover:text-danger px-1 text-sm"
              >
                ×
              </button>
            </li>
          ))}
          {showTaskForm && (
            <NewTaskForm
              itemId={itemId}
              parentId={module.id}
              moduleMode={module.progress_mode}
              startTransition={startTransition}
              pending={pending}
              setError={setError}
              onCreated={(created) => {
                setSteps((prev) => [...prev, created])
                setShowTaskForm(false)
              }}
              onCancel={() => setShowTaskForm(false)}
            />
          )}
        </ul>
      )}

      {!showTaskForm && (
        <div className="pl-9 pr-3 pb-2">
          <button
            type="button"
            onClick={() => setShowTaskForm(true)}
            disabled={pending}
            className="text-xs text-muted hover:text-text"
          >
            + Agregar tarea
          </button>
        </div>
      )}
    </li>
  )
}

function NewStepForm({
  itemId,
  startTransition,
  pending,
  setError,
  onCreated,
  weightMode,
  firstOne,
}: {
  itemId: string
  startTransition: (cb: () => void) => void
  pending: boolean
  setError: (e: string | null) => void
  onCreated: (created: Step) => void
  weightMode: StepsWeightMode
  firstOne?: boolean
}) {
  const [open, setOpen] = useState(firstOne ?? false)
  const [name, setName] = useState('')
  const [weight, setWeight] = useState('')

  const reset = () => {
    setName('')
    setWeight('')
  }

  const handleCreate = () => {
    setError(null)
    if (!name.trim()) return setError('Poné un nombre al módulo.')

    // En 'equal' el peso no se muestra: se envía 1 como placeholder. Se preserva
    // en DB por si el usuario después cambia a 'custom' (ahí lo va a editar).
    // En 'custom' validamos lo que tipeó.
    let weightNum: number
    if (weightMode === 'equal') {
      weightNum = 1
    } else {
      weightNum = Number(weight)
      if (!Number.isFinite(weightNum) || weightNum <= 0 || weightNum > 100) {
        return setError('El peso tiene que ser mayor que 0 y hasta 100.')
      }
    }

    startTransition(async () => {
      const result = await createStepAction({
        item_id: itemId,
        name: name.trim(),
        weight_pct: weightNum,
      })
      if ('error' in result) {
        setError(result.error)
        return
      }
      reset()
      if (!firstOne) setOpen(false)
      if (result.step) onCreated(result.step)
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className="text-sm text-muted hover:text-text"
      >
        + Otro módulo
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Nombre del módulo"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          className={`${inputCls} flex-1`}
        />
        {weightMode === 'custom' && (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0.01}
              max={100}
              step="any"
              placeholder="%"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className={`${inputCls} w-20 text-right tabular`}
            />
            <span className="text-xs text-muted">%</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleCreate}
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Guardando…' : 'Agregar módulo'}
        </button>
        {!firstOne && (
          <button
            type="button"
            onClick={() => {
              reset()
              setOpen(false)
              setError(null)
            }}
            className="text-sm text-muted hover:text-text"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
}

function NewTaskForm({
  itemId,
  parentId,
  moduleMode,
  startTransition,
  pending,
  setError,
  onCreated,
  onCancel,
}: {
  itemId: string
  parentId: string
  moduleMode: ProgressMode
  startTransition: (cb: () => void) => void
  pending: boolean
  setError: (e: string | null) => void
  onCreated: (created: Step) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [weight, setWeight] = useState('')

  const isCount = moduleMode === 'count'

  const handleCreate = () => {
    setError(null)
    const weightNum = isCount ? 1 : Number(weight)
    if (!name.trim()) return setError('Poné un nombre a la tarea.')
    if (!isCount && (!Number.isFinite(weightNum) || weightNum <= 0 || weightNum > 100)) {
      return setError('El peso tiene que ser mayor que 0 y hasta 100.')
    }
    startTransition(async () => {
      const result = await createStepAction({
        item_id: itemId,
        name: name.trim(),
        weight_pct: weightNum,
        parent_step_id: parentId,
      })
      if ('error' in result) {
        setError(result.error)
        return
      }
      if (result.step) onCreated(result.step)
      setName('')
      setWeight('')
    })
  }

  return (
    <li className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 bg-surface/40 px-2.5 py-1.5">
      <span className="w-3.5 shrink-0" aria-hidden />
      <input
        type="text"
        placeholder="Nombre de la tarea"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={120}
        className={`${inputCls} flex-1 min-w-0 py-1 text-xs`}
      />
      {!isCount && (
        <div className="flex items-center gap-0.5">
          <input
            type="number"
            min={0.01}
            max={100}
            step="any"
            placeholder="%"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className={`${inputCls} w-20 text-right text-xs py-1 tabular`}
          />
          <span className="text-[11px] text-muted">%</span>
        </div>
      )}
      <button
        type="button"
        onClick={handleCreate}
        disabled={pending}
        className="text-xs rounded bg-accent px-2 py-1 text-bg hover:opacity-90 disabled:opacity-50"
      >
        Agregar
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="text-xs text-muted hover:text-text"
      >
        Cancelar
      </button>
    </li>
  )
}

function ProgressModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: ProgressMode
  onChange: (m: ProgressMode) => void
  disabled?: boolean
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5 text-[10px]"
      role="radiogroup"
      aria-label="Modo de cálculo del progreso"
    >
      {(['weighted', 'count'] as ProgressMode[]).map((m) => {
        const active = mode === m
        const label = m === 'weighted' ? 'Por peso' : 'Por cantidad'
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(m)}
            className={`rounded-sm px-2 py-0.5 font-medium transition-colors disabled:opacity-50 ${
              active ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** Toggle para alternar entre reparto "Igualitario" y "Personalizado" del peso
 *  entre los módulos del ítem. Persistido a nivel ítem (no a nivel paso). */
function WeightModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: StepsWeightMode
  onChange: (m: StepsWeightMode) => void
  disabled?: boolean
}) {
  const options: { value: StepsWeightMode; label: string }[] = [
    { value: 'equal', label: 'Igualitario' },
    { value: 'custom', label: 'Personalizado' },
  ]
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5 text-[11px]"
      role="radiogroup"
      aria-label="Reparto de peso entre módulos"
    >
      <span className="px-1.5 text-muted">Peso:</span>
      {options.map((o) => {
        const active = mode === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`rounded-sm px-2 py-0.5 font-medium transition-colors disabled:opacity-50 ${
              active ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
