'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, Search } from 'lucide-react'
import {
  addItemsToProjectAction,
  listProjectCandidatesAction,
  type ProjectCandidate,
} from '@/lib/actions/projects'

export function ProjectItemsManager({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [candidates, setCandidates] = useState<ProjectCandidate[] | null>(null)
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Carga lazy: solo cuando el usuario abre el modal. Evita transferir todos
  // los ítems del usuario en cada render del SSR.
  const ensureCandidates = async () => {
    if (candidates !== null || loadingCandidates) return
    setLoadingCandidates(true)
    setLoadError(null)
    try {
      const res = await listProjectCandidatesAction(projectId)
      if ('error' in res) {
        setLoadError(
          res.error === 'not_found'
            ? 'Proyecto no encontrado.'
            : res.error === 'no_auth'
              ? 'Necesitás iniciar sesión.'
              : 'No pudimos cargar los ítems.',
        )
        return
      }
      setCandidates(res.candidates)
    } catch {
      setLoadError('No pudimos cargar los ítems.')
    } finally {
      setLoadingCandidates(false)
    }
  }

  const filtered = useMemo(() => {
    if (!candidates) return []
    const q = query.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter((c) => c.title.toLowerCase().includes(q))
  }, [candidates, query])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConfirm = () => {
    const ids = [...selected]
    if (ids.length === 0) {
      setError('Elegí al menos un ítem.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await addItemsToProjectAction(projectId, ids)
      if (res && 'error' in res && res.error) {
        setError(res.error)
        return
      }
      setSelected(new Set())
      setQuery('')
      // Forzamos recarga la próxima vez que se abra el modal.
      setCandidates(null)
      router.refresh()
      setOpen(false)
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          setError(null)
          void ensureCandidates()
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted hover:text-text hover:bg-surface-2 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Agregar ítems
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 space-y-4 shadow-xl"
          >
            <div className="space-y-1">
              <h3 className="text-base font-semibold">Agregar ítems</h3>
              <p className="text-xs text-muted">
                Elegí los ítems que querés incluir en este proyecto. Pueden ser de
                estudio o de trabajo, no importa la categoría.
              </p>
            </div>

            <div className="relative">
              <Search
                aria-hidden
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar ítem…"
                className="w-full rounded-lg border border-border bg-bg pl-9 pr-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>

            <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
              {loadingCandidates ? (
                <p className="px-4 py-6 text-sm text-muted text-center">
                  Cargando ítems…
                </p>
              ) : loadError ? (
                <p className="px-4 py-6 text-sm text-danger text-center">{loadError}</p>
              ) : (candidates ?? []).length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted text-center">
                  Ya agregaste todos tus ítems o todavía no creaste ninguno.
                </p>
              ) : filtered.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted text-center">
                  Sin coincidencias.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {filtered.map((it) => {
                    const isSelected = selected.has(it.id)
                    const isWork = it.scope === 'work'
                    return (
                      <li key={it.id}>
                        <button
                          type="button"
                          onClick={() => toggle(it.id)}
                          className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-surface-2 transition-colors"
                        >
                          <span
                            aria-hidden
                            className={`h-5 w-5 shrink-0 rounded border flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'bg-accent border-accent text-bg'
                                : 'border-border'
                            }`}
                          >
                            {isSelected && <Check className="h-3.5 w-3.5" />}
                          </span>
                          <span className="flex-1 min-w-0 text-sm truncate">
                            {it.title}
                          </span>
                          <span
                            className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium ${
                              isWork
                                ? 'bg-accent/15 text-accent'
                                : 'bg-surface-2 text-muted'
                            }`}
                          >
                            {isWork ? 'Trabajo' : 'Estudio'}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-lg px-3 py-2 text-sm text-muted hover:text-text disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending || selected.size === 0}
                onClick={handleConfirm}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
              >
                {pending
                  ? 'Agregando…'
                  : `Agregar ${selected.size > 0 ? `(${selected.size})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
