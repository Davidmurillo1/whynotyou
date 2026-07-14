'use client'

import { useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { ProgressRing } from '@/components/progress-ring'
import { CategoryBadge } from '@/components/category-badge'
import { kindLabel, unitLabel } from '@/lib/items/constants'
import {
  computeItemProgress,
  stepsSummary,
  type StepsWeightMode,
} from '@/lib/items/progress'
import { formatRelative } from '@/lib/format'
import { setStepsWeightModeAction } from '@/lib/actions/item-weight-mode'
import { DeadlineBadge } from '@/components/deadline-badge'
import { formatDeadlineLabel, getUrgency } from '@/lib/deadlines/utils'
import { NotesTrigger, NotesPanel, NotesOverview, type Note } from '@/components/notes-control'
import { createNoteAction, updateNoteAction, deleteNoteAction } from '@/lib/actions/notes'
import { StepsEditor, type Step } from './steps-editor'

type ItemForShell = {
  id: string
  title: string
  kind: string
  unit_type: string
  total_units: number
  current_units: number
  status: string
  source_url: string | null
  completed_at: string | null
  steps_weight_mode: StepsWeightMode
  deadline: string | null
}

type CategoryForShell = {
  id: string
  name: string
  color: string
  emoji: string | null
} | null

/**
 * Componente cliente que mantiene el state de `steps` compartido entre el header
 * (ProgressRing + subtítulo) y el editor de pasos. Así, al tachar o agregar una
 * tarea, todo se actualiza al instante sin esperar un `router.refresh()` que
 * re-ejecutaría todas las queries del server component.
 */
export function ItemProgressShell({
  item,
  category,
  initialSteps,
  initialNotes,
  itemActions,
  today,
}: {
  item: ItemForShell
  category: CategoryForShell
  initialSteps: Step[]
  /** Notas del ítem y de sus pasos (estado único, particionado por `step_id`). */
  initialNotes: Note[]
  /** `<ItemActions itemId={...} status={...} />` y compañía — server component
   *  inyectado como children para no traerlo al cliente. */
  itemActions: ReactNode
  /** Día actual (YYYY-MM-DD) en la timezone del perfil, calculado server-side. */
  today: string
}) {
  const [steps, setSteps] = useState<Step[]>(
    [...initialSteps].sort((a, b) => a.position - b.position),
  )
  const [weightMode, setWeightMode] = useState<StepsWeightMode>(item.steps_weight_mode)
  const [, startWeightModeTransition] = useTransition()
  const [weightModeError, setWeightModeError] = useState<string | null>(null)

  // Notas: un único estado con TODAS las notas del ítem + sus pasos. Cada
  // superficie filtra su slice (item = step_id null; paso = step_id === id).
  // Así el contador de cualquier ícono se actualiza optimista sin refetch.
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [notesPending, startNotesTransition] = useTransition()
  const [notesError, setNotesError] = useState<string | null>(null)
  const [itemNotesOpen, setItemNotesOpen] = useState(false)
  const itemNotes = notes.filter((n) => n.step_id === null)

  // Crear (append-on-success): await la action y agrega la nota REAL devuelta.
  // Devuelve mensaje de error o null (lo consume el composer del panel).
  const handleCreateNote = async (
    stepId: string | null,
    body: string,
  ): Promise<string | null> => {
    setNotesError(null)
    const result = await createNoteAction({ item_id: item.id, step_id: stepId, body })
    if ('error' in result) return result.error
    if (result.note) setNotes((prev) => [...prev, result.note!])
    return null
  }

  // Editar (append-on-success): await y reemplaza la nota por la devuelta.
  const handleUpdateNote = async (noteId: string, body: string): Promise<string | null> => {
    setNotesError(null)
    const result = await updateNoteAction({ id: noteId, body })
    if ('error' in result) return result.error
    if (result.note) setNotes((prev) => prev.map((n) => (n.id === noteId ? result.note! : n)))
    return null
  }

  // Borrar (optimista + rollback), calcado de handleDelete de steps.
  const handleDeleteNote = (noteId: string) => {
    setNotesError(null)
    const snapshot = notes
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
    startNotesTransition(async () => {
      const result = await deleteNoteAction({ id: noteId })
      if ('error' in result) {
        setNotesError(result.error)
        setNotes(snapshot)
      }
    })
  }

  const handleWeightModeChange = (next: StepsWeightMode) => {
    if (next === weightMode) return
    const prev = weightMode
    setWeightMode(next)
    setWeightModeError(null)
    startWeightModeTransition(async () => {
      const result = await setStepsWeightModeAction({ item_id: item.id, mode: next })
      if ('error' in result) {
        setWeightModeError(result.error)
        setWeightMode(prev)
      }
    })
  }

  const pct = computeItemProgress({ ...item, steps_weight_mode: weightMode }, steps)
  const summary = stepsSummary(steps)
  const isDone = item.status === 'done'

  return (
    <>
      <section className="space-y-5">
        <Link href="/biblioteca" className="text-sm text-muted hover:text-text">
          ← Biblioteca
        </Link>
        <div className="flex items-start gap-5">
          <ProgressRing value={pct} size={88} stroke={8} />
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight leading-tight">{item.title}</h1>
            <p className="text-sm text-muted mt-1">
              {kindLabel(item.kind)} ·{' '}
              {summary.total > 0 ? (
                <>
                  Progreso por pasos · {summary.done} de {summary.total} completados
                </>
              ) : (
                <>
                  {item.total_units} {unitLabel(item.unit_type, item.total_units)}
                </>
              )}
            </p>
            {/* Meta-row SIEMPRE visible: aloja el ícono de notas del ítem, que
                debe ser descubrible aunque no haya deadline/categoría/notas. */}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {item.deadline && !isDone && (
                <DeadlineBadge
                  urgency={getUrgency(item.deadline, today)}
                  label={formatDeadlineLabel(item.deadline, today)}
                  size="md"
                />
              )}
              {category && (
                <Link href={`/categorias/${category.id}`}>
                  <CategoryBadge
                    name={category.name}
                    color={category.color}
                    emoji={category.emoji}
                    size="sm"
                  />
                </Link>
              )}
              <NotesTrigger
                count={itemNotes.length}
                open={itemNotesOpen}
                onToggle={() => setItemNotesOpen((o) => !o)}
                disabled={notesPending}
                label="Notas del ítem"
              />
            </div>
            {item.source_url && (
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent hover:underline inline-block mt-2 break-all"
              >
                {item.source_url}
              </a>
            )}
          </div>
        </div>

        {itemNotesOpen && (
          <NotesPanel
            notes={itemNotes}
            pending={notesPending}
            onCreate={(body) => handleCreateNote(null, body)}
            onUpdate={handleUpdateNote}
            onDelete={handleDeleteNote}
            title="Notas del ítem"
          />
        )}

        {notesError && (
          <p className="text-sm text-danger" role="alert">
            {notesError}
          </p>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          {!isDone && (
            <Link
              href={`/item/${item.id}/sesion`}
              className="rounded-lg bg-accent px-5 py-2.5 font-medium text-bg hover:opacity-90"
            >
              ▶ Empezar sesión
            </Link>
          )}
          {isDone && (
            <div className="text-success text-sm">
              ✓ Terminado · {item.completed_at && formatRelative(item.completed_at)}
            </div>
          )}
          {itemActions}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted">
          Pasos {steps.length > 0 && `· ${summary.done}/${summary.total}`}
        </h2>
        <StepsEditor
          itemId={item.id}
          steps={steps}
          setSteps={setSteps}
          weightMode={weightMode}
          onWeightModeChange={handleWeightModeChange}
          today={today}
          notes={notes}
          notesPending={notesPending}
          onCreateNote={handleCreateNote}
          onUpdateNote={handleUpdateNote}
          onDeleteNote={handleDeleteNote}
        />
        {weightModeError && (
          <p className="text-sm text-danger" role="alert">
            {weightModeError}
          </p>
        )}
      </section>

      <NotesOverview
        notes={notes}
        steps={steps}
        itemTitle={item.title}
        pending={notesPending}
        onUpdate={handleUpdateNote}
        onDelete={handleDeleteNote}
      />
    </>
  )
}
