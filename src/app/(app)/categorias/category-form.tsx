'use client'

import { useActionState, useState } from 'react'
import { createCategoryAction, type CategoryState } from '@/lib/actions/categories'
import { CATEGORY_COLORS, SUGGESTED_EMOJIS } from '@/lib/categories/constants'

type Parent = { id: string; name: string; emoji: string | null; color: string }

export function CategoryForm({ parents }: { parents: Parent[] }) {
  const [state, action, pending] = useActionState<CategoryState, FormData>(createCategoryAction, null)
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0].hex)
  const [emoji, setEmoji] = useState('')
  const [resetKey, setResetKey] = useState(0)

  return (
    <form
      key={resetKey}
      action={async (fd) => {
        fd.set('color', color)
        fd.set('emoji', emoji)
        await action(fd)
        setResetKey((k) => k + 1)
        setEmoji('')
      }}
      className="space-y-4 max-w-md"
    >
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm text-muted">Nombre</label>
        <input
          id="name"
          name="name"
          required
          maxLength={60}
          placeholder="ej. Programación"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 focus:border-accent focus:outline-none"
        />
      </div>

      {parents.length > 0 && (
        <div className="space-y-1.5">
          <label htmlFor="parent_id" className="block text-sm text-muted">
            Anidar dentro de <span className="text-muted/60">(opcional)</span>
          </label>
          <select
            id="parent_id"
            name="parent_id"
            defaultValue=""
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 focus:border-accent focus:outline-none"
          >
            <option value="">— Categoría raíz —</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.emoji ? `${p.emoji} ` : ''}{p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="block text-sm text-muted">Color</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_COLORS.map((c) => (
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
            placeholder="📚"
            className="w-16 rounded-lg border border-border bg-surface px-3 py-2.5 focus:border-accent focus:outline-none text-center text-lg"
          />
          <div className="flex flex-wrap gap-1">
            {SUGGESTED_EMOJIS.map((e) => (
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
        {pending ? 'Guardando…' : 'Crear categoría'}
      </button>
    </form>
  )
}
