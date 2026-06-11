import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ProgressRing } from '@/components/progress-ring'
import { CategoryBadge } from '@/components/category-badge'
import { EmptyState } from '@/components/empty-state'
import { kindLabel, unitLabel, type ItemScope } from '@/lib/items/constants'
import { DeadlineBadge } from '@/components/deadline-badge'
import { formatDeadlineLabel, getUrgency, todayInTimezone } from '@/lib/deadlines/utils'
import { computeItemProgress } from '@/lib/items/progress'
import {
  computeEfficiency,
  effectiveItemEstimate,
  effectiveProjectEstimate,
  type EffectiveEstimate,
  type EstimateStepLike,
} from '@/lib/efficiency/compute'
import { ProjectActions } from './project-actions'
import { ProjectItemsManager } from './project-items-manager'
import { ProjectEfficiencySection, type MemberEfficiency } from './project-efficiency-section'
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
  estimated_minutes: number | null
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
  steps_weight_mode: 'equal' | 'custom' | null
  estimated_minutes: number | null
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
      .select('id, name, description, color, emoji, status, deadline, estimated_minutes')
      .eq('id', id)
      .eq('user_id', user!.id)
      .maybeSingle(),
    supabase
      .from('project_items')
      .select(
        'added_at, item:items!inner(id, title, kind, unit_type, total_units, current_units, status, category_id, scope, steps_weight_mode, estimated_minutes)',
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

  // --- Eficiencia del proyecto: estimado vs. real -------------------------
  // Segunda pasada one-shot con los ids de los miembros: pasos (para
  // estimaciones derivadas y progreso real) y sesiones (tiempo invertido).
  const memberIds = memberItems.map((i) => i.id)
  const [{ data: memberStepsRaw }, { data: memberSessions }] =
    memberIds.length > 0
      ? await Promise.all([
          supabase
            .from('item_steps')
            .select(
              'id, item_id, weight_pct, is_done, parent_step_id, progress_mode, estimated_minutes',
            )
            .eq('user_id', user!.id)
            .in('item_id', memberIds),
          supabase
            .from('sessions')
            .select('item_id, duration_seconds')
            .in('item_id', memberIds),
        ])
      : [{ data: [] }, { data: [] }]

  const stepsByItem = new Map<string, EstimateStepLike[]>()
  for (const s of memberStepsRaw ?? []) {
    const step: EstimateStepLike = {
      id: s.id as string,
      weight_pct: Number(s.weight_pct),
      is_done: Boolean(s.is_done),
      parent_step_id: (s.parent_step_id as string | null) ?? null,
      progress_mode: ((s.progress_mode as 'weighted' | 'count' | null) ?? 'weighted'),
      estimated_minutes: s.estimated_minutes != null ? Number(s.estimated_minutes) : null,
    }
    const list = stepsByItem.get(s.item_id as string)
    if (list) list.push(step)
    else stepsByItem.set(s.item_id as string, [step])
  }
  const secondsByItem = new Map<string, number>()
  for (const s of memberSessions ?? []) {
    secondsByItem.set(
      s.item_id as string,
      (secondsByItem.get(s.item_id as string) ?? 0) + Number(s.duration_seconds ?? 0),
    )
  }

  type MemberCalc = {
    item: MemberItem
    estimate: EffectiveEstimate | null
    progress: number
    actualSeconds: number
  }
  const memberCalcs: MemberCalc[] = memberItems.map((item) => {
    const itemSteps = stepsByItem.get(item.id) ?? []
    return {
      item,
      estimate: effectiveItemEstimate(
        { estimated_minutes: item.estimated_minutes },
        itemSteps,
      ),
      progress: computeItemProgress(
        {
          current_units: Number(item.current_units),
          total_units: Number(item.total_units),
          steps_weight_mode: item.steps_weight_mode ?? 'equal',
        },
        itemSteps,
      ),
      actualSeconds: secondsByItem.get(item.id) ?? 0,
    }
  })

  const estimatedMembers = memberCalcs.filter(
    (m): m is MemberCalc & { estimate: EffectiveEstimate } => m.estimate != null,
  )
  const projectEstimate = effectiveProjectEstimate(
    { estimated_minutes: prj.estimated_minutes },
    memberCalcs.map((m) => m.estimate),
  )

  // Agregado: solo cuentan los miembros que tienen estimación *y* tiempo real
  // registrado (al menos una sesión). El índice compara las horas ya invertidas
  // contra las horas estimadas de esos ítems; los miembros sin estimación y los
  // que aún no arrancaron se listan aparte para no inflar ni desinflar la métrica.
  const participatingMembers = estimatedMembers.filter((m) => m.actualSeconds > 0)
  let projectEfficiency = null
  if (projectEstimate && participatingMembers.length > 0) {
    const sumEstimates = participatingMembers.reduce((a, m) => a + m.estimate.minutes, 0)
    const earnedMin = participatingMembers.reduce(
      (a, m) => a + m.progress * m.estimate.minutes,
      0,
    )
    const actualSeconds = participatingMembers.reduce((a, m) => a + m.actualSeconds, 0)
    const progress = sumEstimates > 0 ? earnedMin / sumEstimates : 0
    const completed =
      participatingMembers.length === estimatedMembers.length &&
      participatingMembers.every((m) => m.item.status === 'done')
    projectEfficiency = computeEfficiency({
      // Bullet y status comparan tiempo invertido contra la estimación de los
      // ítems que ya arrancaron (no contra el total del proyecto), para no
      // mostrar "vas adelantado" solo porque todavía faltan ítems sin tocar.
      progress: Math.min(1, progress),
      estimateMinutes: sumEstimates,
      actualSeconds,
      completed,
    })
  }

  const memberEfficiencies: MemberEfficiency[] = estimatedMembers.map((m) => ({
    id: m.item.id,
    title: m.item.title,
    estimate: m.estimate,
    efficiency: computeEfficiency({
      progress: m.progress,
      estimateMinutes: m.estimate.minutes,
      actualSeconds: m.actualSeconds,
      completed: m.item.status === 'done',
    }),
  }))
  const unestimatedMembers = memberCalcs
    .filter((m) => m.estimate == null)
    .map((m) => ({ id: m.item.id, title: m.item.title }))
  // ------------------------------------------------------------------------

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
              estimated_minutes:
                prj.estimated_minutes != null ? Number(prj.estimated_minutes) : null,
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

      <ProjectEfficiencySection
        estimate={projectEstimate}
        efficiency={projectEfficiency}
        members={memberEfficiencies}
        unestimated={unestimatedMembers}
      />

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
