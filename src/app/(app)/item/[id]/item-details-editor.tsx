'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateItemFieldsAction } from '@/lib/actions/items'
import {
  ITEM_KIND_OPTIONS,
  UNIT_TYPE_OPTIONS,
  type ItemKind,
  type UnitType,
} from '@/lib/items/constants'

const inputCls =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted/60 focus:border-accent focus:outline-none'

export type ItemEditable = {
  id: string
  title: string
  kind: ItemKind
  unit_type: UnitType
  total_units: number
  source_url: string | null
}

export function ItemDetailsEditor({ item }: { item: ItemEditable }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const [title, setTitle] = useState(item.title)
  const [kind, setKind] = useState<ItemKind>(item.kind)
  const [unitType, setUnitType] = useState<UnitType>(item.unit_type)
  const [totalUnits, setTotalUnits] = useState<string>(String(item.total_units))
  const [sourceUrl, setSourceUrl] = useState<string>(item.source_url ?? '')

  const handleSave = () => {
    setError(null)
    const totalNum = Number(totalUnits)
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
      setError('La cantidad total tiene que ser mayor que cero.')
      return
    }
    startTransition(async () => {
      const result = await updateItemFieldsAction({
        id: item.id,
        title: title.trim() || undefined,
        kind,
        unit_type: unitType,
        total_units: totalNum,
        source_url: sourceUrl.trim() || '',
      })
      if ('error' in result) {
        setError(result.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  const handleCancel = () => {
    setTitle(item.title)
    setKind(item.kind)
    setUnitType(item.unit_type)
    setTotalUnits(String(item.total_units))
    setSourceUrl(item.source_url ?? '')
    setError(null)
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted hover:text-text underline-offset-2 hover:underline"
      >
        Editar
      </button>
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface px-4 py-3">
      <div className="space-y-1.5">
        <label htmlFor="edit-title" className="block text-xs text-muted">Título</label>
        <input
          id="edit-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="edit-kind" className="block text-xs text-muted">Tipo</label>
          <select
            id="edit-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ItemKind)}
            className={inputCls}
          >
            {ITEM_KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="edit-unit-type" className="block text-xs text-muted">Lo mido en</label>
          <select
            id="edit-unit-type"
            value={unitType}
            onChange={(e) => setUnitType(e.target.value as UnitType)}
            className={inputCls}
          >
            {UNIT_TYPE_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="edit-total" className="block text-xs text-muted">Cantidad total</label>
        <input
          id="edit-total"
          type="number"
          min={1}
          step="any"
          value={totalUnits}
          onChange={(e) => setTotalUnits(e.target.value)}
          className={`${inputCls} tabular`}
        />
        <p className="text-[11px] text-muted/80">
          Si bajás este número por debajo de lo que ya avanzaste, lo recortamos automáticamente.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="edit-source-url" className="block text-xs text-muted">
          Enlace <span className="text-muted/60">(opcional)</span>
        </label>
        <input
          id="edit-source-url"
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://..."
          className={inputCls}
        />
      </div>

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending}
          className="text-sm text-muted hover:text-text"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
