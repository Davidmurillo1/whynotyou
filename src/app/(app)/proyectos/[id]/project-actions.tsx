'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react'
import {
  deleteProjectAction,
  setProjectStatusAction,
  updateProjectAction,
} from '@/lib/actions/projects'
import {
  PROJECT_COLORS,
  PROJECT_SUGGESTED_EMOJIS,
} from '@/lib/projects/constants'

type Initial = {
  name: string
  description: string | null
  color: string
  emoji: string | null
}

export function ProjectActions({
  projectId,
  status,
  initial,
}: {
  projectId: string
  status: 'active' | 'archived'
  initial: Initial
}) {
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const toggleArchive = () => {
    startTransition(async () => {
      await setProjectStatusAction(
        projectId,
        status === 'active' ? 'archived' : 'active',
      )
      router.refresh()
    })
  }

  const handleDelete = () => {
    if (
      !confirm(
        '¿Eliminar este proyecto? Los ítems no se borran, solo se quita la agrupación.',
      )
    )
      return
    startTransition(async () => {
      await deleteProjectAction(projectId)
    })
  }

  return (
    <>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={pending}
          aria-label="Editar proyecto"
          title="Editar"
          className="p-2 rounded-lg text-muted hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-50"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={toggleArchive}
          disabled={pending}
          aria-label={status === 'active' ? 'Archivar proyecto' : 'Desarchivar proyecto'}
          title={status === 'active' ? 'Archivar' : 'Desarchivar'}
          className="p-2 rounded-lg text-muted hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-50"
        >
          {status === 'active' ? (
            <Archive className="h-4 w-4" />
          ) : (
            <ArchiveRestore className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          aria-label="Eliminar proyecto"
          title="Eliminar"
          className="p-2 rounded-lg text-muted hover:text-danger hover:bg-surface-2 transition-colors disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {editing && (
        <EditModal
          projectId={projectId}
          initial={initial}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}

function EditModal({
  projectId,
  initial,
  onClose,
}: {
  projectId: string
  initial: Initial
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description ?? '')
  const [color, setColor] = useState(initial.color)
  const [emoji, setEmoji] = useState(initial.emoji ?? '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await updateProjectAction({
        id: projectId,
        name: name.trim(),
        description: description.trim() || null,
        color,
        emoji: emoji.trim() || null,
      })
      if ('error' in res && res.error) {
        const msg =
          res.error === 'no_auth'
            ? 'Necesitás iniciar sesión.'
            : res.error === 'update_failed'
              ? 'No pudimos guardar los cambios.'
              : res.error
        setError(msg)
        return
      }
      router.refresh()
      onClose()
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 space-y-5 shadow-xl"
      >
        <h3 className="text-base font-semibold">Editar proyecto</h3>

        <div className="space-y-1.5">
          <label htmlFor="edit-name" className="block text-sm text-muted">
            Nombre
          </label>
          <input
            id="edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="edit-desc" className="block text-sm text-muted">
            Descripción <span className="text-muted/60">(opcional)</span>
          </label>
          <textarea
            id="edit-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={280}
            rows={2}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm text-muted">Color</label>
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setColor(c.hex)}
                aria-label={c.name}
                className={`w-6 h-6 rounded-full border-2 transition-transform ${
                  color === c.hex ? 'border-text scale-110' : 'border-transparent'
                }`}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="edit-emoji" className="block text-sm text-muted">
            Emoji <span className="text-muted/60">(opcional)</span>
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              id="edit-emoji"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
              maxLength={4}
              className="w-14 rounded-lg border border-border bg-bg px-2 py-2 text-center text-base focus:border-accent focus:outline-none"
            />
            <div className="flex flex-wrap gap-1">
              {PROJECT_SUGGESTED_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className="text-base p-1 rounded hover:bg-surface-2 transition-colors"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg px-3 py-2 text-sm text-muted hover:text-text disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}
