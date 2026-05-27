import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ProgressRing } from '@/components/progress-ring'
import { CategoryBadge } from '@/components/category-badge'
import { EmptyState } from '@/components/empty-state'
import { kindLabel, statusLabel, unitLabel, type ItemScope } from '@/lib/items/constants'

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
  scope: ItemScope
}

type ScopeFilter = 'all' | ItemScope

function parseScope(raw: string | string[] | undefined): ScopeFilter {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === 'study' || value === 'work') return value
  return 'all'
}

export default async function BibliotecaPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>
}) {
  const params = await searchParams
  const scopeFilter = parseScope(params.scope)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let itemsQuery = supabase
    .from('items')
    .select('id, title, kind, unit_type, total_units, current_units, status, category_id, scope, updated_at')
    .eq('user_id', user!.id)
    .order('updated_at', { ascending: false })

  if (scopeFilter !== 'all') {
    itemsQuery = itemsQuery.eq('scope', scopeFilter)
  }

  const [{ data: items }, { data: cats }] = await Promise.all([
    itemsQuery,
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

  const tabs: { value: ScopeFilter; label: string }[] = [
    { value: 'all', label: 'Todo' },
    { value: 'study', label: 'Estudio' },
    { value: 'work', label: 'Trabajo' },
  ]

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Biblioteca</h1>
          <p className="text-sm text-muted mt-1">
            {list.length} {list.length === 1 ? 'ítem' : 'ítems'}
            {scopeFilter !== 'all' && (
              <> con scope <span className="text-text">{scopeFilter === 'study' ? 'Estudio' : 'Trabajo'}</span></>
            )}
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

      <nav className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface p-1" aria-label="Filtrar por tipo de proyecto">
        {tabs.map((tab) => {
          const active = scopeFilter === tab.value
          const href = tab.value === 'all' ? '/biblioteca' : `/biblioteca?scope=${tab.value}`
          return (
            <Link
              key={tab.value}
              href={href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>

      {list.length === 0 ? (
        <EmptyState
          title={
            scopeFilter === 'all'
              ? 'Tu biblioteca está vacía.'
              : scopeFilter === 'work'
                ? 'No tenés proyectos de trabajo todavía.'
                : 'No tenés ítems de estudio en esta vista.'
          }
          description={
            scopeFilter === 'all'
              ? 'Agregá lo primero que tengas entre manos y empezá.'
              : 'Cambiá de filtro o agregá uno nuevo.'
          }
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
                          <ScopeChip scope={item.scope ?? 'study'} />
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

function ScopeChip({ scope }: { scope: ItemScope }) {
  const isWork = scope === 'work'
  return (
    <span
      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium ${
        isWork
          ? 'bg-accent/15 text-accent'
          : 'bg-surface-2 text-muted'
      }`}
    >
      {isWork ? 'Trabajo' : 'Estudio'}
    </span>
  )
}
