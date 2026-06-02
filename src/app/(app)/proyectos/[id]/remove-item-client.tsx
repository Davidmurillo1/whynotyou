'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { removeItemFromProjectAction } from '@/lib/actions/projects'

export function RemoveItemClient({
  projectId,
  itemId,
}: {
  projectId: string
  itemId: string
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const handle = () => {
    if (!confirm('¿Quitar este ítem del proyecto? El ítem y sus sesiones no se borran.'))
      return
    startTransition(async () => {
      await removeItemFromProjectAction(projectId, itemId)
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      aria-label="Quitar del proyecto"
      title="Quitar del proyecto"
      className="p-2 rounded-lg text-muted hover:text-danger hover:bg-surface-2 transition-colors disabled:opacity-50"
    >
      <X className="h-4 w-4" />
    </button>
  )
}
