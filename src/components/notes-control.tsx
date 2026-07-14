'use client'

import { useState } from 'react'
import { StickyNote, Bookmark, Layers, ListChecks, Pencil } from 'lucide-react'
import { formatRelative } from '@/lib/format'

export type Note = {
  id: string
  item_id: string
  step_id: string | null
  body: string
  created_at: string
}

/** Devuelve un mensaje de error (string) o `null` si la creación fue exitosa. */
export type NoteCreateHandler = (body: string) => Promise<string | null>
/** Devuelve un mensaje de error (string) o `null` si la edición fue exitosa. */
export type NoteUpdateHandler = (noteId: string, body: string) => Promise<string | null>
export type NoteDeleteHandler = (noteId: string) => void

const noteTextareaCls =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted/60 focus:border-accent focus:outline-none resize-y'

/**
 * Una nota en una lista: muestra el cuerpo (texto plano) + su fecha, con
 * acciones de editar y borrar que aparecen en hover. Al editar, el cuerpo se
 * reemplaza por un textarea con Guardar/Cancelar. Compartido entre `<NotesPanel>`
 * y `<NotesOverview>` para no duplicar la lógica de edición.
 */
function NoteRowItem({
  note,
  pending,
  onUpdate,
  onDelete,
  liClassName,
  dot,
}: {
  note: Note
  pending: boolean
  onUpdate: NoteUpdateHandler
  onDelete: NoteDeleteHandler
  liClassName: string
  dot?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note.body)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const body = draft.trim()
    if (!body) {
      setError('La nota no puede estar vacía.')
      return
    }
    if (body === note.body) {
      setEditing(false)
      setError(null)
      return
    }
    setSaving(true)
    setError(null)
    const err = await onUpdate(note.id, body)
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    setEditing(false)
  }

  const handleCancel = () => {
    setDraft(note.body)
    setError(null)
    setEditing(false)
  }

  const handleDelete = () => {
    const ok = window.confirm('¿Querés borrar esta nota? No se puede deshacer.')
    if (!ok) return
    onDelete(note.id)
  }

  if (editing) {
    return (
      <li className={liClassName}>
        <div className="flex-1 min-w-0 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={4000}
            rows={3}
            className={noteTextareaCls}
            aria-label="Editar nota"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-bg hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="text-xs text-muted hover:text-text"
            >
              Cancelar
            </button>
            {error && (
              <p className="text-xs text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      </li>
    )
  }

  return (
    <li className={`group/note ${liClassName}`}>
      {dot && (
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/40" aria-hidden />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text whitespace-pre-wrap break-words leading-relaxed">
          {note.body}
        </p>
        <p className="text-[11px] text-muted mt-1">{formatRelative(note.created_at)}</p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => {
            setDraft(note.body)
            setEditing(true)
          }}
          disabled={pending}
          aria-label="Editar nota"
          title="Editar nota"
          className="px-0.5 text-muted opacity-0 transition-opacity hover:text-accent focus:opacity-100 group-hover/note:opacity-100 disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          aria-label="Quitar nota"
          title="Quitar nota"
          className="px-0.5 text-sm text-muted opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover/note:opacity-100 disabled:opacity-50"
        >
          ×
        </button>
      </div>
    </li>
  )
}

/**
 * Disparador de notas: vive DENTRO de la fila flex del elemento (header del
 * ítem, cluster del módulo, `<li>` de la tarea). Dos estados, calcados de
 * `StepEstimateControl`:
 *   - vacío  → ícono `StickyNote` atenuado (descubrible aunque no haya notas).
 *   - con N  → pill con acento + contador.
 * El panel se renderiza aparte (ver `<NotesPanel>`), como bloque full-width.
 */
export function NotesTrigger({
  count,
  open,
  onToggle,
  compact,
  disabled,
  label,
}: {
  count: number
  open: boolean
  onToggle: () => void
  compact?: boolean
  disabled?: boolean
  /** Etiqueta accesible, ej. `Notas de "0. Definir"`. */
  label: string
}) {
  if (count > 0) {
    return (
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 shrink-0 transition-colors disabled:opacity-50 ${
          open ? 'border-accent/50 bg-accent/15 text-accent' : 'border-border bg-surface-2 text-accent'
        } ${compact ? 'text-[10px]' : 'text-[11px]'}`}
      >
        <StickyNote className="h-3 w-3" aria-hidden />
        <span className="tabular">{count}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-expanded={open}
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 p-1 transition-colors disabled:opacity-50 ${
        open ? 'text-accent' : 'text-muted/60 hover:text-text'
      }`}
    >
      <StickyNote className="h-3.5 w-3.5" aria-hidden />
    </button>
  )
}

/**
 * Panel de notas: lista de notas (texto plano, con su fecha y un botón para
 * quitar) + composer para agregar una nueva. Bloque full-width que se
 * renderiza DEBAJO de la fila del elemento (a otro nivel del DOM que el
 * trigger). El `body` se muestra como texto plano con `whitespace-pre-wrap`
 * (React escapa por defecto; sin auto-linkificar).
 */
export function NotesPanel({
  notes,
  pending,
  onCreate,
  onUpdate,
  onDelete,
  title,
  compact,
}: {
  notes: Note[]
  /** Deshabilita el borrado mientras hay una mutación del padre en vuelo. */
  pending: boolean
  onCreate: NoteCreateHandler
  onUpdate: NoteUpdateHandler
  onDelete: NoteDeleteHandler
  title?: string
  compact?: boolean
}) {
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const body = draft.trim()
    if (!body) {
      setError('La nota no puede estar vacía.')
      return
    }
    setSubmitting(true)
    setError(null)
    const err = await onCreate(body)
    setSubmitting(false)
    if (err) {
      setError(err)
      return
    }
    setDraft('')
  }

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-3 space-y-3">
      {title && <p className="text-xs uppercase tracking-wider text-muted">{title}</p>}

      {notes.length === 0 ? (
        <p className="text-xs text-muted">Todavía no hay notas.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <NoteRowItem
              key={n.id}
              note={n}
              pending={pending}
              onUpdate={onUpdate}
              onDelete={onDelete}
              liClassName="flex items-start gap-2 rounded-lg border border-border/60 bg-surface-2/40 px-2.5 py-2"
            />
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={4000}
          rows={compact ? 2 : 3}
          placeholder="Anotá specs, recordatorios o lo que necesites…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted/60 focus:border-accent focus:outline-none resize-y"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !draft.trim()}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : 'Agregar nota'}
          </button>
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Tipo estructural mínimo de un paso para resolver nombres y jerarquía en la
 *  vista centralizada. Evita importar `Step` desde `steps-editor` (import
 *  circular: `steps-editor` ya importa de este archivo). */
type StepLike = {
  id: string
  name: string
  parent_step_id: string | null
  position: number
}

type NotesSource = {
  key: string
  kind: 'item' | 'module' | 'task'
  title: string
  /** Módulo padre, solo para tareas (contexto `módulo › tarea`). */
  context?: string
  notes: Note[]
}

/** Chip que identifica el origen de un grupo de notas. */
function SourceChip({ kind }: { kind: NotesSource['kind'] }) {
  const map = {
    item: { Icon: Bookmark, label: 'Ítem', cls: 'border-accent/30 bg-accent/10 text-accent' },
    module: { Icon: Layers, label: 'Módulo', cls: 'border-border bg-surface-2 text-text' },
    task: { Icon: ListChecks, label: 'Tarea', cls: 'border-border bg-surface-2 text-muted' },
  } as const
  const { Icon, label, cls } = map[kind]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide shrink-0 ${cls}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  )
}

const byCreatedAsc = (a: Note, b: Note) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0

/**
 * Apartado centralizado: reúne TODAS las notas del ítem y sus pasos, agrupadas
 * por origen (ítem → módulos → tareas, en orden jerárquico), cada grupo
 * identificado con su chip de tipo y nombre. Se alimenta del mismo estado
 * `notes` que los paneles inline, así que sincroniza en vivo. Se oculta si el
 * ítem no tiene ninguna nota.
 */
export function NotesOverview({
  notes,
  steps,
  itemTitle,
  pending,
  onUpdate,
  onDelete,
}: {
  notes: Note[]
  steps: StepLike[]
  itemTitle: string
  pending: boolean
  onUpdate: NoteUpdateHandler
  onDelete: NoteDeleteHandler
}) {
  const roots = steps
    .filter((s) => !s.parent_step_id)
    .sort((a, b) => a.position - b.position)
  const childrenOf = (id: string) =>
    steps.filter((s) => s.parent_step_id === id).sort((a, b) => a.position - b.position)
  const notesForStep = (id: string) =>
    notes.filter((n) => n.step_id === id).sort(byCreatedAsc)

  // Grupos en orden jerárquico, solo los que tienen al menos una nota.
  const groups: NotesSource[] = []
  const itemNotes = notes.filter((n) => n.step_id === null).sort(byCreatedAsc)
  if (itemNotes.length) {
    groups.push({ key: 'item', kind: 'item', title: itemTitle, notes: itemNotes })
  }
  for (const root of roots) {
    const rootNotes = notesForStep(root.id)
    if (rootNotes.length) {
      groups.push({ key: root.id, kind: 'module', title: root.name, notes: rootNotes })
    }
    for (const child of childrenOf(root.id)) {
      const childNotes = notesForStep(child.id)
      if (childNotes.length) {
        groups.push({
          key: child.id,
          kind: 'task',
          title: child.name,
          context: root.name,
          notes: childNotes,
        })
      }
    }
  }

  const total = groups.reduce((acc, g) => acc + g.notes.length, 0)
  if (total === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted">
        <StickyNote className="h-3.5 w-3.5" aria-hidden />
        Notas · {total}
      </h2>

      <div className="space-y-2.5">
        {groups.map((g) => (
          <div
            key={g.key}
            className="overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-border/80"
          >
            <div className="flex items-center gap-2 border-b border-border/60 bg-gradient-to-r from-surface-2/50 to-transparent px-4 py-2.5">
              <SourceChip kind={g.kind} />
              {g.context && (
                <span className="text-xs text-muted truncate max-w-[40%] shrink-0">
                  {g.context}
                  <span className="mx-1 text-muted/40">›</span>
                </span>
              )}
              <span className="text-sm font-medium text-text truncate">{g.title}</span>
              <span className="ml-auto shrink-0 text-[11px] text-muted tabular">
                {g.notes.length} {g.notes.length === 1 ? 'nota' : 'notas'}
              </span>
            </div>

            <ul className="divide-y divide-border/50">
              {g.notes.map((n) => (
                <NoteRowItem
                  key={n.id}
                  note={n}
                  pending={pending}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  dot
                  liClassName="flex items-start gap-3 px-4 py-3"
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
