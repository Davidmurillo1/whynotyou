'use client'

import { useActionState, useState } from 'react'
import {
  createProjectAction,
  type ProjectFormState,
} from '@/lib/actions/projects'
import {
  PROJECT_COLORS,
  PROJECT_DEFAULT_COLOR,
  PROJECT_SUGGESTED_EMOJIS,
} from '@/lib/projects/constants'

export function ProjectForm() {
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(
    createProjectAction,
    null,
  )
  const [color, setColor] = useState<string>(PROJECT_DEFAULT_COLOR)
  const [emoji, setEmoji] = useState('')

  return (
    <form
      action={async (fd) => {
        fd.set('color', color)
        fd.set('emoji', emoji)
        await action(fd)
      }}
      className="space-y-5"
    >
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm text-muted">
          Nombre
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={80}
          placeholder="ej. Lanzar el side-project"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 focus:border-accent focus:outline-none"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className="block text-sm text-muted">
          Descripción <span className="text-muted/60">(opcional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          maxLength={280}
          rows={2}
          placeholder="¿Para qué es este proyecto?"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 focus:border-accent focus:outline-none resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="deadline" className="block text-sm text-muted">
          Fecha límite <span className="text-muted/60">(opcional)</span>
        </label>
        <input
          id="deadline"
          name="deadline"
          type="date"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 focus:border-accent focus:outline-none"
        />
        <p className="text-xs text-muted/80">¿Para cuándo querés cerrar este proyecto?</p>
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
              className={`w-7 h-7 rounded-full border-2 transition-transform ${
                color === c.hex ? 'border-text scale-110' : 'border-transparent'
              }`}
              style={{ background: c.hex }}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="emoji" className="block text-sm text-muted">
          Emoji <span className="text-muted/60">(opcional)</span>
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            id="emoji"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
            maxLength={4}
            placeholder="🎯"
            className="w-16 rounded-lg border border-border bg-surface px-3 py-2.5 focus:border-accent focus:outline-none text-center text-lg"
          />
          <div className="flex flex-wrap gap-1">
            {PROJECT_SUGGESTED_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className="text-lg p-1.5 rounded hover:bg-surface-2 transition-colors"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2.5 font-medium text-bg hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Creando…' : 'Crear proyecto'}
      </button>
    </form>
  )
}
