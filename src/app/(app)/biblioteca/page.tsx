import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ProgressRing } from '@/components/progress-ring'
import { CategoryBadge } from '@/components/category-badge'
import { EmptyState } from '@/components/empty-state'
import { kindLabel, statusLabel, unitLabel } from '@/lib/items/constants'

export const metadata = { title: 'Biblioteca · Why Not You?' }
export const dynamic = 'force-dynamic'

const STATUS_ORDER = ['active', 'paused', 'done', 'abandoned'] as const

type Item = {
  id: string
  title: string
  kind: string
  unit_type: string
  total_units: number
  current_units: number
  status: string
  category_id: string | null
}

export default async function BibliotecaPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: items }, { data: cats }] = await Promise.all([
    supabase
      .from('items')
      .select('id, title, kind, unit_type, total_units, current_units, status, category_id, updated_at')
      .eq('user_id', user!.id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('categories')
      .select('id, name, color, emoji')
      .eq('user_id', user!.id),
  ])

  const list = (items ?? []) as Item[]
  const catMap = new Map((cats ?? []).map((c) => [c.id, c]))

  const grouped = STATUS_ORDER.map((status) => ({
    status,
    items: list.filter((i) => i.status === status),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Biblioteca</h1>
          <p className="text-sm text-muted mt-1">
            {list.length} {list.length === 1 ? 'ítem' : 'ítems'} en total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/categorias"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted hover:text-text"
          >
            Categorías
          </Link>
          <Link
            href="/item/nuevo"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
          >
            + Nuevo
          </Link>
        </div>
      </header>

      {list.length === 0 ? (
        <EmptyState
          title="Tu biblioteca está vacía."
          description="Agregá lo primero que estés aprendiendo y empezá."
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
        grouped.map((group) => (
          <section key={group.status} className="space-y-3">
            <h2 className="text-xs uppercase tracking-wider text-muted">
              {statusLabel(group.status)} · {group.items.length}
            </h2>
            <ul className="space-y-2">
              {group.items.map((item) => {
                const pct = Number(item.current_units) / Number(item.total_units)
                const cat = item.category_id ? catMap.get(item.category_id) : null
                return (
                  <li key={item.id}>
                    <Link
                      href={`/item/${item.id}`}
                      className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:bg-surface-2 transition-colors"
                    >
                      <ProgressRing value={pct} size={40} stroke={4} showLabel={false} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{item.title}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-muted">
                            {kindLabel(item.kind)} · {item.current_units}/{item.total_units}{' '}
                            {unitLabel(item.unit_type, Number(item.total_units))}
                          </p>
                          {cat && (
                            <CategoryBadge name={cat.name} color={cat.color} emoji={cat.emoji} />
                          )}
                        </div>
                      </div>
                      <span className="tabular text-sm text-muted shrink-0">
                        {Math.round(pct * 100)}%
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
