'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateItemStatusAction, deleteItemAction } from '@/lib/actions/items'

export function ItemActions({ itemId, status }: { itemId: string; status: string }) {
  const [pending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const router = useRouter()

  const togglePause = () => {
    const next = status === 'paused' ? 'active' : 'paused'
    startTransition(async () => {
      await updateItemStatusAction(itemId, next)
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
      await deleteItemAction(itemId)
    })
  }

  return (
    <div className="flex items-center gap-2">
      {status !== 'done' && (
        <button
          type="button"
          onClick={togglePause}
          disabled={pending}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted hover:text-text"
        >
          {status === 'paused' ? 'Reanudar' : 'Pausar'}
        </button>
      )}
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className={`rounded-lg px-3 py-2 text-sm transition-colors ${
          confirmDelete
            ? 'bg-danger text-bg'
            : 'border border-border bg-surface text-muted hover:text-danger'
        }`}
      >
        {confirmDelete ? '¿Seguro?' : 'Eliminar'}
      </button>
    </div>
  )
}
