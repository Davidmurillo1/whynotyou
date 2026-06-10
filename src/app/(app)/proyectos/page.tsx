import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ProgressRing } from '@/components/progress-ring'
import { EmptyState } from '@/components/empty-state'
import { DeadlineBadge } from '@/components/deadline-badge'
import { formatDeadlineLabel, getUrgency, todayInTimezone } from '@/lib/deadlines/utils'

export const metadata = { title: 'Proyectos · Why Not You?' }
export const dynamic = 'force-dynamic'

type Project = {
  id: string
  name: string
  description: string | null
  color: string
  emoji: string | null
  status: 'active' | 'archived'
  order_index: number
  deadline: string | null
}

export default async function ProyectosPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Una sola pasada paralela. Para los progresos, hacemos foreign-key embed
  // (`items!inner`) y solo viajan los ítems que pertenecen a algún proyecto —
  // antes traíamos todos los del usuario y filtrábamos en memoria.
  const [{ data: projects }, { data: memberships }, { data: profile }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, description, color, emoji, status, order_index, deadline, created_at')
      .eq('user_id', user!.id)
      .order('status', { ascending: true })
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: false }),
    supabase
      .from('project_items')
      .select('project_id, item:items!inner(current_units, total_units)')
      .eq('user_id', user!.id),
    supabase.from('profiles').select('timezone').eq('id', user!.id).single(),
  ])

  const today = todayInTimezone(profile?.timezone)

  const list = (projects ?? []) as Project[]

  type AggRow = {
    project_id: string
    item: { current_units: number | string; total_units: number | string } | null
  }
  const aggByProject = new Map<string, { sumCurrent: number; sumTotal: number; count: number }>()
  for (const row of (memberships ?? []) as unknown as AggRow[]) {
    const acc = aggByProject.get(row.project_id) ?? { sumCurrent: 0, sumTotal: 0, count: 0 }
    if (row.item) {
      acc.sumCurrent += Number(row.item.current_units)
      acc.sumTotal += Number(row.item.total_units)
    }
    acc.count += 1
    aggByProject.set(row.project_id, acc)
  }

  function progressFor(projectId: string): { pct: number; count: number } {
    const agg = aggByProject.get(projectId)
    if (!agg) return { pct: 0, count: 0 }
    const pct = agg.sumTotal === 0 ? 0 : agg.sumCurrent / agg.sumTotal
    return { pct, count: agg.count }
  }

  const actives = list.filter((p) => p.status === 'active')
  const archived = list.filter((p) => p.status === 'archived')

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proyectos</h1>
          <p className="text-sm text-muted mt-1">
            Carpetas que cruzan estudio y trabajo.
          </p>
        </div>
        <Link
          href="/proyectos/nuevo"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
        >
          + Nuevo
        </Link>
      </header>

      {list.length === 0 ? (
        <EmptyState
          title="Todavía no tenés proyectos."
          description="Un proyecto agrupa lo que estás haciendo para un mismo objetivo, aunque venga de fuentes distintas."
          action={
            <Link
              href="/proyectos/nuevo"
              className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
            >
              Crear proyecto
            </Link>
          }
        />
      ) : (
        <>
          {actives.length > 0 && (
            <Section title="Activos" projects={actives} progressFor={progressFor} today={today} />
          )}
          {archived.length > 0 && (
            <Section title="Archivados" projects={archived} progressFor={progressFor} today={today} muted />
          )}
        </>
      )}
    </div>
  )
}

function Section({
  title,
  projects,
  progressFor,
  today,
  muted,
}: {
  title: string
  projects: Project[]
  progressFor: (id: string) => { pct: number; count: number }
  today: string
  muted?: boolean
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs uppercase tracking-wider text-muted">
        {title} · {projects.length}
      </h2>
      <ul className="space-y-2">
        {projects.map((p) => {
          const { pct, count } = progressFor(p.id)
          return (
            <li key={p.id}>
              <Link
                href={`/proyectos/${p.id}`}
                className={`flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:bg-surface-2 transition-colors ${
                  muted ? 'opacity-70' : ''
                }`}
              >
                <ProgressRing value={pct} size={40} stroke={4} showLabel={false} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: p.color }}
                    />
                    {p.emoji && <span aria-hidden>{p.emoji}</span>}
                    <p className="font-medium truncate">{p.name}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <p className="text-xs text-muted">
                      {count} {count === 1 ? 'ítem' : 'ítems'}
                      {p.description && <> · {p.description}</>}
                    </p>
                    {p.deadline && p.status === 'active' && (
                      <DeadlineBadge
                        urgency={getUrgency(p.deadline, today)}
                        label={formatDeadlineLabel(p.deadline, today)}
                      />
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
  )
}
