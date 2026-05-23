'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setItemCategoryAction } from '@/lib/actions/categories'

export function ItemCategoryEditor({
  itemId,
  currentCategoryId,
  options,
}: {
  itemId: string
  currentCategoryId: string | null
  options: { id: string; label: string }[]
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const handleChange = (value: string) => {
    startTransition(async () => {
      await setItemCategoryAction(itemId, value || null)
      router.refresh()
    })
  }

  return (
    <select
      value={currentCategoryId ?? ''}
      disabled={pending}
      onChange={(e) => handleChange(e.target.value)}
      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none disabled:opacity-50"
    >
      <option value="">— Sin categoría —</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
  )
}
