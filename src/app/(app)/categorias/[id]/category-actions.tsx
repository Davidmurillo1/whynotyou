'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateCategoryAction, deleteCategoryAction } from '@/lib/actions/categories'
import { CATEGORY_COLORS, SUGGESTED_EMOJIS } from '@/lib/categories/constants'

export function CategoryActions({
  categoryId,
  name: initialName,
  color: initialColor,
  emoji: initialEmoji,
}: {
  categoryId: string
  name: string
  color: string
  emoji: string | null
}) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [color, setColor] = useState(initialColor)
  const [emoji, setEmoji] = useState(initialEmoji ?? '')

  const handleSave = () => {
    startTransition(async () => {
      await updateCategoryAction(categoryId, {
        name: name.trim(),
        color,
        emoji: emoji.trim() || null,
      })
      setOpen(false)
      router.refresh()
    })
  }

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 4000)
      return
    }
    startTransition(async () => {
      await deleteCategoryAction(categoryId)
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-muted hover:text-text"
      >
        Editar
      </button>
    )
  }

  return (
    <div className="space-y-4 w-full max-w-xs rounded-xl border border-border bg-surface p-4">
      <div className="space-y-1.5">
        <label className="block text-xs text-muted">Nombre</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 focus:border-accent focus:outline-none"
        />
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs text-muted">Color</label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              onClick={() => setColor(c.hex)}
              className={`w-6 h-6 rounded-full border-2 ${
                color === c.hex ? 'border-text' : 'border-transparent'
              }`}
              style={{ background: c.hex }}
            />
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs text-muted">Emoji</label>
        <div className="flex items-center gap-2">
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
            maxLength={4}
            className="w-14 rounded-lg border border-border bg-bg px-2 py-2 focus:border-accent focus:outline-none text-center"
          />
          <div className="flex flex-wrap gap-1">
            {SUGGESTED_EMOJIS.slice(0, 8).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className="text-lg p-1 rounded hover:bg-surface-2"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !name.trim()}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-muted hover:text-text"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className={`ml-auto rounded-lg px-3 py-1.5 text-sm transition-colors ${
            confirmDelete ? 'bg-danger text-bg' : 'text-muted hover:text-danger'
          }`}
        >
          {confirmDelete ? '¿Seguro?' : 'Eliminar'}
        </button>
      </div>
    </div>
  )
}
