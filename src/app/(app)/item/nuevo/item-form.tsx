'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { createItemAction, type ItemActionState } from '@/lib/actions/items'
import { ITEM_KIND_OPTIONS, UNIT_TYPE_OPTIONS } from '@/lib/items/constants'

const inputCls =
  'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-text placeholder:text-muted/60 focus:border-accent focus:outline-none'

type CategoryOption = { id: string; label: string }

export function ItemForm({ categoryOptions }: { categoryOptions: CategoryOption[] }) {
  const [state, action, pending] = useActionState<ItemActionState, FormData>(createItemAction, null)

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="title" className="block text-sm text-muted">Título</label>
        <input
          id="title"
          name="title"
          required
          maxLength={200}
          placeholder="ej. Designing Data-Intensive Applications"
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="kind" className="block text-sm text-muted">Tipo</label>
          <select id="kind" name="kind" required defaultValue="book" className={inputCls}>
            {ITEM_KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="unit_type" className="block text-sm text-muted">Lo mido en</label>
          <select id="unit_type" name="unit_type" required defaultValue="pages" className={inputCls}>
            {UNIT_TYPE_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="total_units" className="block text-sm text-muted">Cantidad total</label>
        <input
          id="total_units"
          name="total_units"
          type="number"
          min="1"
          step="any"
          required
          placeholder="ej. 600"
          className={inputCls}
        />
      </div>

      {categoryOptions.length > 0 && (
        <div className="space-y-1.5">
          <label htmlFor="category_id" className="block text-sm text-muted">
            Categoría <span className="text-muted/60">(opcional)</span>
          </label>
          <select id="category_id" name="category_id" defaultValue="" className={inputCls}>
            <option value="">— Sin categoría —</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <p className="text-xs text-muted/80">
            <Link href="/categorias" className="hover:text-text">Gestionar categorías →</Link>
          </p>
        </div>
      )}

      {categoryOptions.length === 0 && (
        <p className="text-xs text-muted/80">
          <Link href="/categorias" className="hover:text-text">+ Crear categorías para organizar tu biblioteca</Link>
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="source_url" className="block text-sm text-muted">
          Enlace <span className="text-muted/60">(opcional)</span>
        </label>
        <input id="source_url" name="source_url" type="url" placeholder="https://..." className={inputCls} />
      </div>

      {state?.error && (
        <p className="text-sm text-danger" role="alert">{state.error}</p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-5 py-2.5 font-medium text-bg hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Guardando…' : 'Guardar'}
        </button>
        <Link href="/dashboard" className="text-sm text-muted hover:text-text">
          Cancelar
        </Link>
      </div>
    </form>
  )
}
