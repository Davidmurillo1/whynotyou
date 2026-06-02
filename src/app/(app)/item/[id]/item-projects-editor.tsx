'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ProjectBadge } from '@/components/project-badge'
import { ProjectPicker } from '@/components/project-picker'
import {
  listAllProjectsAction,
  setItemProjectsAction,
  type AllProjectsRow,
} from '@/lib/actions/projects'

type Project = {
  id: string
  name: string
  color: string
  emoji: string | null
  status: 'active' | 'archived'
}

export function ItemProjectsEditor({
  itemId,
  currentProjects,
}: {
  itemId: string
  currentProjects: Project[]
}) {
  const [open, setOpen] = useState(false)
  const [allProjects, setAllProjects] = useState<AllProjectsRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  // Carga lazy: solo al abrir el picker.
  const ensureAllProjects = async () => {
    if (allProjects !== null || loading) return
    setLoading(true)
    setLoadError(null)
    try {
      const res = await listAllProjectsAction()
      if ('error' in res) {
        setLoadError(
          res.error === 'no_auth'
            ? 'Necesitás iniciar sesión.'
            : 'No pudimos cargar los proyectos.',
        )
        return
      }
      setAllProjects(res.projects)
    } catch {
      setLoadError('No pudimos cargar los proyectos.')
    } finally {
      setLoading(false)
    }
  }

  const selectedIds = currentProjects.map((p) => p.id)

  const handleConfirm = (ids: string[]) => {
    startTransition(async () => {
      await setItemProjectsAction(itemId, ids)
      setAllProjects(null)
      router.refresh()
      setOpen(false)
    })
  }

  return (
    <div className="space-y-3">
      {currentProjects.length === 0 ? (
        <p className="text-sm text-muted">
          Este ítem no está en ningún proyecto todavía.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {currentProjects.map((p) => (
            <li key={p.id}>
              <Link href={`/proyectos/${p.id}`} className="inline-block">
                <ProjectBadge name={p.name} color={p.color} emoji={p.emoji} size="md" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            void ensureAllProjects()
          }}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-50"
        >
          {currentProjects.length === 0 ? 'Agregar a un proyecto' : 'Gestionar proyectos'}
        </button>
      </div>

      {open && (
        loadError ? (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            onClick={() => setOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 space-y-3 shadow-xl"
            >
              <p className="text-sm text-danger">{loadError}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-muted hover:text-text transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : loading || allProjects === null ? (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            onClick={() => setOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="rounded-2xl border border-border bg-surface px-6 py-8 text-sm text-muted"
            >
              Cargando proyectos…
            </div>
          </div>
        ) : (
          <ProjectPicker
            projects={allProjects.map((p) => ({
              id: p.id,
              name: p.status === 'archived' ? `${p.name} (archivado)` : p.name,
              color: p.color,
              emoji: p.emoji,
            }))}
            initialSelected={selectedIds}
            onConfirm={handleConfirm}
            onCancel={() => setOpen(false)}
            pending={pending}
            emptyHint="Creá un proyecto en /proyectos para empezar a usarlos."
          />
        )
      )}
    </div>
  )
}
