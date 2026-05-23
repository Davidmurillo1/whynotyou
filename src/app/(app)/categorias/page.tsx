import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { CategoryBadge } from '@/components/category-badge'
import { EmptyState } from '@/components/empty-state'
import { CategoryForm } from './category-form'

export const metadata = { title: 'Categorías · Why Not You?' }
export const dynamic = 'force-dynamic'

type Cat = {
  id: string
  name: string
  color: string
  emoji: string | null
  parent_id: string | null
  order_index: number
}

export default async function CategoriasPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: cats } = await supabase
    .from('categories')
    .select('id, name, color, emoji, parent_id, order_index')
    .eq('user_id', user!.id)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true })

  const all = (cats ?? []) as Cat[]
  const roots = all.filter((c) => !c.parent_id)
  const childrenByParent = new Map<string, Cat[]>()
  for (const c of all) {
    if (c.parent_id) {
      if (!childrenByParent.has(c.parent_id)) childrenByParent.set(c.parent_id, [])
      childrenByParent.get(c.parent_id)!.push(c)
    }
  }

  // Conteo de ítems por categoría
  const { data: itemCounts } = await supabase
    .from('items')
    .select('category_id')
    .eq('user_id', user!.id)
  const countByCat = new Map<string, number>()
  for (const i of itemCounts ?? []) {
    if (!i.category_id) continue
    countByCat.set(i.category_id, (countByCat.get(i.category_id) ?? 0) + 1)
  }

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Categorías</h1>
        <p className="text-sm text-muted">Para que la biblioteca tenga forma.</p>
      </header>

      {roots.length === 0 ? (
        <EmptyState
          title="Todavía no tenés categorías."
          description="Una buena primera: lo que estés aprendiendo más seguido."
        />
      ) : (
        <ul className="space-y-3">
          {roots.map((root) => {
            const kids = childrenByParent.get(root.id) ?? []
            const rootCount = countByCat.get(root.id) ?? 0
            return (
              <li key={root.id} className="rounded-2xl border border-border bg-surface px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/categorias/${root.id}`} className="flex items-center gap-3 min-w-0 group">
                    <CategoryBadge name={root.name} color={root.color} emoji={root.emoji} size="md" />
                    <span className="text-xs text-muted shrink-0">
                      {rootCount} {rootCount === 1 ? 'ítem' : 'ítems'}
                    </span>
                  </Link>
                </div>
                {kids.length > 0 && (
                  <ul className="mt-3 ml-3 pl-3 border-l border-border space-y-2">
                    {kids.map((k) => {
                      const c = countByCat.get(k.id) ?? 0
                      return (
                        <li key={k.id} className="flex items-center justify-between gap-3">
                          <Link href={`/categorias/${k.id}`} className="flex items-center gap-2 group">
                            <CategoryBadge name={k.name} color={k.color} emoji={k.emoji} size="sm" />
                            <span className="text-xs text-muted shrink-0">
                              {c} {c === 1 ? 'ítem' : 'ítems'}
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <section className="space-y-4">
        <h2 className="text-xs uppercase tracking-wider text-muted">Crear nueva</h2>
        <CategoryForm parents={roots.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji, color: r.color }))} />
      </section>
    </div>
  )
}
