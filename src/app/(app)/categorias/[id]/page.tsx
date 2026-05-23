import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { CategoryBadge } from '@/components/category-badge'
import { ProgressRing } from '@/components/progress-ring'
import { EmptyState } from '@/components/empty-state'
import { unitLabel } from '@/lib/items/constants'
import { formatDuration } from '@/lib/format'
import { CategoryActions } from './category-actions'

export const dynamic = 'force-dynamic'

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: cat } = await supabase
    .from('categories')
    .select('id, name, color, emoji, parent_id')
    .eq('id', id)
    .eq('user_id', user!.id)
    .maybeSingle()

  if (!cat) notFound()

  const [{ data: subcats }, { data: items }, { data: parent }] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, color, emoji')
      .eq('parent_id', id)
      .order('order_index', { ascending: true }),
    supabase
      .from('items')
      .select('id, title, kind, unit_type, total_units, current_units, status')
      .eq('category_id', id)
      .order('updated_at', { ascending: false }),
    cat.parent_id
      ? supabase.from('categories').select('id, name, emoji').eq('id', cat.parent_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // Minutos totales para esta categoría (sum de sesiones de ítems en esta cat)
  let totalMinutes = 0
  if (items && items.length > 0) {
    const { data: minutes } = await supabase
      .from('sessions')
      .select('duration_seconds, items!inner(category_id)')
      .eq('items.category_id', id)
    totalMinutes = Math.round((minutes ?? []).reduce((a, b) => a + (b.duration_seconds ?? 0), 0) / 60)
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="text-sm">
          <Link href="/categorias" className="text-muted hover:text-text">
            ← Categorías
          </Link>
          {parent && (
            <>
              <span className="text-muted/60 mx-2">/</span>
              <Link
                href={`/categorias/${parent.id}`}
                className="text-muted hover:text-text"
              >
                {parent.emoji ? `${parent.emoji} ` : ''}{parent.name}
              </Link>
            </>
          )}
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <CategoryBadge name={cat.name} color={cat.color} emoji={cat.emoji} size="md" />
          </div>
          <CategoryActions
            categoryId={cat.id}
            name={cat.name}
            color={cat.color}
            emoji={cat.emoji}
          />
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Ítems" value={String((items ?? []).length)} />
          <Stat label="Subcategorías" value={String((subcats ?? []).length)} />
          <Stat label="Tiempo" value={formatDuration(totalMinutes * 60)} />
        </div>
      </section>

      {(subcats ?? []).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-muted">Subcategorías</h2>
          <ul className="space-y-2">
            {(subcats ?? []).map((s) => (
              <li key={s.id}>
                <Link
                  href={`/categorias/${s.id}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 hover:bg-surface-2 transition-colors"
                >
                  <CategoryBadge name={s.name} color={s.color} emoji={s.emoji} size="md" />
                  <span className="text-xs text-muted">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted">
          Ítems {(items ?? []).length > 0 && `· ${(items ?? []).length}`}
        </h2>
        {!items || items.length === 0 ? (
          <EmptyState
            title="No hay ítems en esta categoría todavía."
            action={
              <Link
                href="/item/nuevo"
                className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
              >
                Crear ítem
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2">
            {items.map((it) => {
              const pct = Number(it.current_units) / Number(it.total_units)
              return (
                <li key={it.id}>
                  <Link
                    href={`/item/${it.id}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:bg-surface-2 transition-colors"
                  >
                    <ProgressRing value={pct} size={36} stroke={4} showLabel={false} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{it.title}</p>
                      <p className="text-xs text-muted">
                        {it.current_units}/{it.total_units} {unitLabel(it.unit_type, Number(it.total_units))}
                      </p>
                    </div>
                    <span className="tabular text-sm text-muted shrink-0">{Math.round(pct * 100)}%</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-3">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="tabular text-lg font-medium mt-0.5">{value}</p>
    </div>
  )
}
