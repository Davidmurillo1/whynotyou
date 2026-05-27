import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  statusLabel,
  unitLabel,
  type ItemKind,
  type ItemScope,
  type UnitType,
} from '@/lib/items/constants'
import { formatDuration, formatRelative } from '@/lib/format'
import { ItemActions } from './item-actions'
import { ItemCategoryEditor } from './item-category-editor'
import { ItemScopeEditor } from './item-scope-editor'
import { ItemDetailsEditor } from './item-details-editor'
import { ItemProgressShell } from './item-progress-shell'
import { type Step } from './steps-editor'

export const dynamic = 'force-dynamic'

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: item }, { data: sessions }, { data: cats }, { data: stepsRaw }] = await Promise.all([
    supabase
      .from('items')
      .select(
        'id, title, kind, unit_type, total_units, current_units, status, source_url, started_at, completed_at, category_id, scope, steps_weight_mode',
      )
      .eq('id', id)
      .eq('user_id', user!.id)
      .maybeSingle(),
    supabase
      .from('sessions')
      .select('id, started_at, duration_seconds, units_progressed, note')
      .eq('item_id', id)
      .order('started_at', { ascending: false })
      .limit(20),
    supabase
      .from('categories')
      .select('id, name, color, emoji, parent_id')
      .eq('user_id', user!.id)
      .order('order_index', { ascending: true }),
    supabase
      .from('item_steps')
      .select('id, name, weight_pct, position, is_done, parent_step_id, progress_mode')
      .eq('item_id', id)
      .eq('user_id', user!.id)
      .order('position', { ascending: true }),
  ])

  if (!item) notFound()

  // Normalizamos `steps` para el cliente: weight_pct viene como string desde
  // Postgres numeric, convertimos a number una sola vez.
  const steps: Step[] = (stepsRaw ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    weight_pct: Number(s.weight_pct),
    position: Number(s.position),
    is_done: Boolean(s.is_done),
    parent_step_id: (s.parent_step_id as string | null) ?? null,
    progress_mode: ((s.progress_mode as 'weighted' | 'count' | null) ?? 'weighted'),
  }))

  const hasSteps = steps.length > 0
  const currentCat = item.category_id ? (cats ?? []).find((c) => c.id === item.category_id) : null
  const scope: ItemScope = (item.scope as ItemScope) ?? 'study'

  // Aplanar categorías con sangría
  const flatOptions = (() => {
    const all = cats ?? []
    const roots = all.filter((c) => !c.parent_id)
    const out: { id: string; label: string }[] = []
    for (const r of roots) {
      out.push({ id: r.id, label: `${r.emoji ? r.emoji + ' ' : ''}${r.name}` })
      const kids = all.filter((c) => c.parent_id === r.id)
      for (const k of kids) {
        out.push({ id: k.id, label: `   └ ${k.emoji ? k.emoji + ' ' : ''}${k.name}` })
      }
    }
    return out
  })()

  return (
    <div className="space-y-10">
      <ItemProgressShell
        item={{
          id: item.id,
          title: item.title,
          kind: item.kind,
          unit_type: item.unit_type,
          total_units: Number(item.total_units),
          current_units: Number(item.current_units),
          status: item.status,
          source_url: item.source_url ?? null,
          completed_at: item.completed_at ?? null,
          steps_weight_mode:
            (item.steps_weight_mode as 'equal' | 'custom' | null) ?? 'equal',
        }}
        category={
          currentCat
            ? { id: currentCat.id, name: currentCat.name, color: currentCat.color, emoji: currentCat.emoji }
            : null
        }
        initialSteps={steps}
        itemActions={<ItemActions itemId={item.id} status={item.status} />}
      />

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted">Tipo de proyecto</h2>
        <ItemScopeEditor itemId={item.id} currentScope={scope} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-wider text-muted">Detalles del ítem</h2>
        </div>
        <ItemDetailsEditor
          item={{
            id: item.id,
            title: item.title,
            kind: item.kind as ItemKind,
            unit_type: item.unit_type as UnitType,
            total_units: Number(item.total_units),
            source_url: item.source_url ?? null,
          }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted">Categoría</h2>
        <ItemCategoryEditor
          itemId={item.id}
          currentCategoryId={item.category_id}
          options={flatOptions}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted">
          Últimas sesiones {sessions && sessions.length > 0 && `· ${sessions.length}`}
        </h2>
        {!sessions || sessions.length === 0 ? (
          <p className="text-muted text-sm rounded-xl border border-border bg-surface px-4 py-6 text-center">
            Sin sesiones todavía. La primera siempre es la más difícil.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {sessions.map((s) => (
              <li key={s.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="text-text">{formatRelative(s.started_at)}</span>
                    <span className="text-muted"> · {formatDuration(s.duration_seconds)}</span>
                  </p>
                  {s.note && <p className="text-xs text-muted mt-1 line-clamp-2">{s.note}</p>}
                </div>
                {!hasSteps && (
                  <span className="tabular text-sm text-success shrink-0">
                    +{Number(s.units_progressed)} {unitLabel(item.unit_type, Number(s.units_progressed))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="text-xs text-muted">
        Estado: <span className="text-text">{statusLabel(item.status)}</span>
      </section>
    </div>
  )
}
