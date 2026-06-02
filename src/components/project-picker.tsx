'use client'

import { useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'

export type PickerProject = {
  id: string
  name: string
  color: string
  emoji: string | null
}

type Props = {
  projects: PickerProject[]
  initialSelected: string[]
  onConfirm: (selected: string[]) => void
  onCancel: () => void
  pending?: boolean
  confirmLabel?: string
  emptyHint?: string
}

export function ProjectPicker({
  projects,
  initialSelected,
  onConfirm,
  onCancel,
  pending,
  confirmLabel = 'Guardar',
  emptyHint = 'Todavía no tenés proyectos. Creá uno en /proyectos.',
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelected),
  )
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => p.name.toLowerCase().includes(q))
  }, [projects, query])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 space-y-4 shadow-xl"
      >
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Asignar proyectos</h3>
          <p className="text-xs text-muted">
            Elegí en qué proyectos querés incluir este ítem.
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
            placeholder="Buscar proyecto…"
            className="w-full rounded-lg border border-border bg-bg pl-9 pr-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>

        <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
          {projects.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted text-center">{emptyHint}</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted text-center">
              Sin coincidencias.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((p) => {
                const isSelected = selected.has(p.id)
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => toggle(p.id)}
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
                      <span
                        aria-hidden
                        className="h-3 w-3 shrink-0 rounded-sm"
                        style={{ background: p.color }}
                      />
                      <span className="flex-1 min-w-0 text-sm truncate">
                        {p.emoji && <span className="mr-1">{p.emoji}</span>}
                        {p.name}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg px-3 py-2 text-sm text-muted hover:text-text disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm([...selected])}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Guardando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
