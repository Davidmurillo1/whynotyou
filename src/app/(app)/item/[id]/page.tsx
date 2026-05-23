import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ProgressRing } from '@/components/progress-ring'
import { CategoryBadge } from '@/components/category-badge'
import { kindLabel, statusLabel, unitLabel } from '@/lib/items/constants'
import { formatDuration, formatRelative } from '@/lib/format'
import { ItemActions } from './item-actions'
import { ItemCategoryEditor } from './item-category-editor'

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

  const [{ data: item }, { data: sessions }, { data: cats }] = await Promise.all([
    supabase
      .from('items')
      .select('id, title, kind, unit_type, total_units, current_units, status, source_url, started_at, completed_at, category_id')
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
  ])

  if (!item) notFound()

  const pct = Number(item.current_units) / Number(item.total_units)
  const isDone = item.status === 'done'
  const currentCat = item.category_id ? (cats ?? []).find((c) => c.id === item.category_id) : null

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
      <section className="space-y-5">
        <Link href="/biblioteca" className="text-sm text-muted hover:text-text">
          ← Biblioteca
        </Link>
        <div className="flex items-start gap-5">
          <ProgressRing value={pct} size={88} stroke={8} />
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight leading-tight">{item.title}</h1>
            <p className="text-sm text-muted mt-1">
              {kindLabel(item.kind)} · {item.total_units} {unitLabel(item.unit_type, item.total_units)}
            </p>
            {currentCat && (
              <div className="mt-2">
                <Link href={`/categorias/${currentCat.id}`}>
                  <CategoryBadge
                    name={currentCat.name}
                    color={currentCat.color}
                    emoji={currentCat.emoji}
                    size="sm"
                  />
                </Link>
              </div>
            )}
            {item.source_url && (
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent hover:underline inline-block mt-2 break-all"
              >
                {item.source_url}
              </a>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {!isDone && (
            <Link
              href={`/item/${item.id}/sesion`}
              className="rounded-lg bg-accent px-5 py-2.5 font-medium text-bg hover:opacity-90"
            >
              ▶ Empezar sesión
            </Link>
          )}
          {isDone && (
            <div className="text-success text-sm">
              ✓ Terminado · {item.completed_at && formatRelative(item.completed_at)}
            </div>
          )}
          <ItemActions itemId={item.id} status={item.status} />
        </div>
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
                <span className="tabular text-sm text-success shrink-0">
                  +{Number(s.units_progressed)} {unitLabel(item.unit_type, Number(s.units_progressed))}
                </span>
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
