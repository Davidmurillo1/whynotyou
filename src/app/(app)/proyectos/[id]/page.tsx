import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ProgressRing } from '@/components/progress-ring'
import { CategoryBadge } from '@/components/category-badge'
import { EmptyState } from '@/components/empty-state'
import { kindLabel, unitLabel, type ItemScope } from '@/lib/items/constants'
import { DeadlineBadge } from '@/components/deadline-badge'
import { formatDeadlineLabel, getUrgency, todayInTimezone } from '@/lib/deadlines/utils'
import { ProjectActions } from './project-actions'
import { ProjectItemsManager } from './project-items-manager'
import { RemoveItemClient } from './remove-item-client'

export const dynamic = 'force-dynamic'

type ProjectRow = {
  id: string
  name: string
  description: string | null
  color: string
  emoji: string | null
  status: 'active' | 'archived'
  deadline: string | null
}

type MemberItem = {
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { title: 'Proyecto · Why Not You?' }
  const { data } = await supabase
    .from('projects')
    .select('name')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  return { title: data ? `${data.name} · Why Not You?` : 'Proyecto · Why Not You?' }
}

export default async function ProyectoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Una sola pasada paralela: proyecto + ítems miembros (join PostgREST) + categorías.
  // Antes traíamos TODOS los ítems del usuario y filtrábamos en memoria. Ahora
  // solo viajan los ítems que pertenecen al proyecto, vía foreign-key embed.
  const [{ data: project }, { data: memberRows }, { data: cats }, { data: profile }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, description, color, emoji, status, deadline')
      .eq('id', id)
      .eq('user_id', user!.id)
      .maybeSingle(),
    supabase
      .from('project_items')
      .select(
        'added_at, item:items!inner(id, title, kind, unit_type, total_units, current_units, status, category_id, scope)',
      )
      .eq('project_id', id)
      .eq('user_id', user!.id)
      .order('added_at', { ascending: false }),
    supabase
      .from('categories')
      .select('id, name, color, emoji')
      .eq('user_id', user!.id),
    supabase.from('profiles').select('timezone').eq('id', user!.id).single(),
  ])

  if (!project) notFound()
  const prj = project as ProjectRow
  const today = todayInTimezone(profile?.timezone)

  type MemberRow = { added_at: string; item: MemberItem | null }
  const memberItems: MemberItem[] = ((memberRows ?? []) as unknown as MemberRow[])
    .map((r) => r.item)
    .filter((i): i is MemberItem => i !== null)
  const catMap = new Map((cats ?? []).map((c) => [c.id, c]))

  const sumCurrent = memberItems.reduce((acc, i) => acc + Number(i.current_units), 0)
  const sumTotal = memberItems.reduce((acc, i) => acc + Number(i.total_units), 0)
  const pct = sumTotal === 0 ? 0 : sumCurrent / sumTotal
  const doneCount = memberItems.filter(
    (i) => Number(i.total_units) > 0 && Number(i.current_units) >= Number(i.total_units),
  ).length
  const activeCount = memberItems.filter((i) => i.status === 'active').length

  const isArchived = prj.status === 'archived'

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="text-xs text-muted">
          <Link href="/proyectos" className="hover:text-text transition-colors">
            ← Proyectos
          </Link>
        </p>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ background: prj.color }}
            />
            {prj.emoji && <span className="text-2xl" aria-hidden>{prj.emoji}</span>}
            <h1 className="text-2xl font-semibold tracking-tight truncate">{prj.name}</h1>
            {isArchived && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium bg-surface-2 text-muted">
                Archivado
              </span>
            )}
          </div>
          <ProjectActions
            projectId={prj.id}
            status={prj.status}
            initial={{
              name: prj.name,
              description: prj.description,
              color: prj.color,
              emoji: prj.emoji,
              deadline: prj.deadline,
            }}
          />
        </div>
        {prj.deadline && !isArchived && (
          <DeadlineBadge
            urgency={getUrgency(prj.deadline, today)}
            label={formatDeadlineLabel(prj.deadline, today)}
            size="md"
          />
        )}
        {prj.description && (
          <p className="text-sm text-muted">{prj.description}</p>
        )}
      </header>

      <section className="rounded-2xl border border-border bg-surface px-5 py-6">
        <div className="flex items-center gap-5">
          <ProgressRing value={pct} size={96} stroke={8} showLabel={false} />
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-3xl font-semibold tabular">{Math.round(pct * 100)}%</p>
            <p className="text-sm text-muted">
              {memberItems.length} {memberItems.length === 1 ? 'ítem' : 'ítems'}
              {memberItems.length > 0 && (
                <>
                  {' '}· {activeCount} {activeCount === 1 ? 'activo' : 'activos'} · {doneCount}{' '}
                  {doneCount === 1 ? 'terminado' : 'terminados'}
                </>
              )}
            </p>
          </div>
        </div>
      </section>

      {/* El picker de candidatos se carga lazy cuando el usuario abre el modal,
          así no transferimos todos los ítems del usuario en cada render. */}
      <ProjectItemsManager projectId={prj.id} />

      {memberItems.length === 0 ? (
        <EmptyState
          title="Este proyecto está vacío."
          description="Agregá los ítems que aportan a este objetivo, sin importar la categoría o si son estudio o trabajo."
        />
      ) : (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            Ítems del proyecto · {memberItems.length}
          </h2>
          <ul className="space-y-2">
            {memberItems.map((item) => {
              const itemPct =
                Number(item.total_units) === 0
                  ? 0
                  : Number(item.current_units) / Number(item.total_units)
              const cat = item.category_id ? catMap.get(item.category_id) : null
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
                >
                  <Link
                    href={`/item/${item.id}`}
                    className="flex items-center gap-3 flex-1 min-w-0 hover:bg-surface-2 -m-2 p-2 rounded-lg transition-colors"
                  >
                    <ProgressRing value={itemPct} size={36} stroke={4} showLabel={false} />
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
                          <CategoryBadge
                            name={cat.name as string}
                            color={cat.color as string}
                            emoji={(cat.emoji as string | null) ?? null}
                          />
                        )}
                      </div>
                    </div>
                    <span className="tabular text-sm text-muted shrink-0">
                      {Math.round(itemPct * 100)}%
                    </span>
                  </Link>
                  <RemoveItemClient projectId={prj.id} itemId={item.id} />
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

function ScopeChip({ scope }: { scope: ItemScope }) {
  const isWork = scope === 'work'
  return (
    <span
      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium ${
        isWork ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-muted'
      }`}
    >
      {isWork ? 'Trabajo' : 'Estudio'}
    </span>
  )
}
