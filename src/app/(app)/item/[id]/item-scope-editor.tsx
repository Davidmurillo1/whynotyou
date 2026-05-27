'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateItemScopeAction } from '@/lib/actions/items'
import { ITEM_SCOPE_OPTIONS, type ItemScope } from '@/lib/items/constants'

export function ItemScopeEditor({
  itemId,
  currentScope,
}: {
  itemId: string
  currentScope: ItemScope
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const handleChange = (next: ItemScope) => {
    if (next === currentScope) return
    startTransition(async () => {
      await updateItemScopeAction(itemId, next)
      router.refresh()
    })
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface p-1" role="radiogroup" aria-label="Tipo de proyecto">
      {ITEM_SCOPE_OPTIONS.map((opt) => {
        const active = currentScope === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={pending}
            onClick={() => handleChange(opt.value)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
              active
                ? 'bg-accent/15 text-accent'
                : 'text-muted hover:text-text'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
