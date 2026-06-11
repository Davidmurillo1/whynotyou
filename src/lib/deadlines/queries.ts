import type { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  computeItemProgress,
  computeStepProgress,
  isStepEffectivelyDone,
  type StepLike,
  type StepsWeightMode,
} from '@/lib/items/progress'
import { daysLeft, getUrgency, type DeadlineEntry } from './utils'

type Supa = Awaited<ReturnType<typeof createSupabaseServerClient>>

type ItemRow = {
  id: string
  title: string
  deadline: string
  status: string
  current_units: number | string
  total_units: number | string
  steps_weight_mode: StepsWeightMode | null
}

type ProjectRow = {
  id: string
  name: string
  emoji: string | null
  deadline: string
}

type StepRow = {
  id: string
  name: string
  deadline: string
  parent_step_id: string | null
  item_id: string
  item: { id: string; title: string; status: string } | null
}

type MembershipRow = { project_id: string; item_id: string }

/**
 * Todos los deadlines **pendientes** del usuario, ya clasificados y ordenados
 * por fecha ascendente (los vencidos quedan naturalmente primero).
 *
 * Pendiente significa: ítems `active`/`paused`, proyectos `active`, pasos con
 * `is_done = false` cuyo ítem no esté `done` ni `abandoned`. Todo lo demás se
 * excluye acá, server-side.
 *
 * Dos olas de queries one-shot (sin N+1): la primera trae las entidades con
 * deadline + membresías; la segunda, los datos para progreso y contexto.
 */
export async function fetchDeadlineEntries(
  supabase: Supa,
  userId: string,
  today: string,
  opts: { limit?: number } = {},
): Promise<DeadlineEntry[]> {
  // Ola A — entidades con deadline y membresías proyecto↔ítem.
  const [{ data: itemsRaw }, { data: projectsRaw }, { data: stepsRaw }, { data: membershipsRaw }] =
    await Promise.all([
      supabase
        .from('items')
        .select('id, title, deadline, status, current_units, total_units, steps_weight_mode')
        .eq('user_id', userId)
        .not('deadline', 'is', null)
        .in('status', ['active', 'paused']),
      supabase
        .from('projects')
        .select('id, name, emoji, deadline')
        .eq('user_id', userId)
        .eq('status', 'active')
        .not('deadline', 'is', null),
      supabase
        .from('item_steps')
        .select('id, name, deadline, parent_step_id, item_id, item:items!inner(id, title, status)')
        .eq('user_id', userId)
        .eq('is_done', false)
        .not('deadline', 'is', null),
      supabase.from('project_items').select('project_id, item_id').eq('user_id', userId),
    ])

  const items = (itemsRaw ?? []) as ItemRow[]
  const projects = (projectsRaw ?? []) as ProjectRow[]
  const memberships = (membershipsRaw ?? []) as MembershipRow[]
  // Pasos cuyo ítem sigue vigente (ni terminado ni abandonado).
  const steps = ((stepsRaw ?? []) as unknown as StepRow[]).filter(
    (s) => s.item && s.item.status !== 'done' && s.item.status !== 'abandoned',
  )

  const itemIdsWithDeadline = new Set(items.map((i) => i.id))
  const projectIdsWithDeadline = new Set(projects.map((p) => p.id))

  // Ítems cuyos pasos necesitamos para calcular progreso (del ítem o del módulo).
  const progressItemIds = [...new Set([...items.map((i) => i.id), ...steps.map((s) => s.item_id)])]
  // Ítems miembros de proyectos con deadline → progreso agregado del proyecto.
  const memberItemIds = [
    ...new Set(
      memberships.filter((m) => projectIdsWithDeadline.has(m.project_id)).map((m) => m.item_id),
    ),
  ]
  // Proyectos que dan contexto a los ítems con deadline.
  const contextProjectIds = [
    ...new Set(
      memberships.filter((m) => itemIdsWithDeadline.has(m.item_id)).map((m) => m.project_id),
    ),
  ]

  // Ola B — datos de progreso y contexto (solo si hay algo que traer).
  type ProgressStepRow = StepLike & { item_id: string }
  type MemberItemRow = { id: string; current_units: number | string; total_units: number | string }
  type ContextProjectRow = { id: string; name: string; order_index: number }

  const [progressStepsRes, memberItemsRes, contextProjectsRes] = await Promise.all([
    progressItemIds.length > 0
      ? supabase
          .from('item_steps')
          .select('id, item_id, weight_pct, is_done, parent_step_id, progress_mode')
          .eq('user_id', userId)
          .in('item_id', progressItemIds)
      : Promise.resolve({ data: [] }),
    memberItemIds.length > 0
      ? supabase
          .from('items')
          .select('id, current_units, total_units')
          .eq('user_id', userId)
          .in('id', memberItemIds)
      : Promise.resolve({ data: [] }),
    contextProjectIds.length > 0
      ? supabase
          .from('projects')
          .select('id, name, order_index')
          .eq('user_id', userId)
          .in('id', contextProjectIds)
      : Promise.resolve({ data: [] }),
  ])

  const stepsByItem = new Map<string, ProgressStepRow[]>()
  for (const row of (progressStepsRes.data ?? []) as ProgressStepRow[]) {
    const list = stepsByItem.get(row.item_id) ?? []
    list.push(row)
    stepsByItem.set(row.item_id, list)
  }

  const memberItemById = new Map(
    ((memberItemsRes.data ?? []) as MemberItemRow[]).map((i) => [i.id, i]),
  )
  const aggByProject = new Map<string, { current: number; total: number; count: number }>()
  for (const m of memberships) {
    if (!projectIdsWithDeadline.has(m.project_id)) continue
    const member = memberItemById.get(m.item_id)
    if (!member) continue
    const acc = aggByProject.get(m.project_id) ?? { current: 0, total: 0, count: 0 }
    acc.current += Number(member.current_units)
    acc.total += Number(member.total_units)
    acc.count += 1
    aggByProject.set(m.project_id, acc)
  }

  const contextProjectById = new Map(
    ((contextProjectsRes.data ?? []) as ContextProjectRow[]).map((p) => [p.id, p]),
  )
  const firstProjectByItem = new Map<string, string>()
  for (const itemId of itemIdsWithDeadline) {
    const related = memberships
      .filter((m) => m.item_id === itemId)
      .map((m) => contextProjectById.get(m.project_id))
      .filter((p): p is ContextProjectRow => Boolean(p))
      .sort((a, b) => a.order_index - b.order_index)
    if (related[0]) firstProjectByItem.set(itemId, related[0].name)
  }

  // --- Armar las entradas -------------------------------------------------

  const entries: DeadlineEntry[] = []

  for (const p of projects) {
    const agg = aggByProject.get(p.id)
    entries.push({
      entityType: 'project',
      id: p.id,
      title: p.emoji ? `${p.emoji} ${p.name}` : p.name,
      contextLabel: null,
      deadline: p.deadline,
      href: `/proyectos/${p.id}`,
      progress: agg && agg.total > 0 ? clamp01(agg.current / agg.total) : null,
      urgency: getUrgency(p.deadline, today),
      daysLeft: daysLeft(p.deadline, today),
    })
  }

  for (const i of items) {
    const progress = clamp01(computeItemProgress(i, stepsByItem.get(i.id) ?? []))
    // Items al 100% (típicamente completados vía pasos, sin que `status` haya
    // pasado a 'done' automáticamente) ya cumplieron — fuera de la agenda.
    if (progress >= 1) continue
    const ctx: string[] = []
    const firstProject = firstProjectByItem.get(i.id)
    if (firstProject) ctx.push(firstProject)
    if (i.status === 'paused') ctx.push('En pausa')
    entries.push({
      entityType: 'item',
      id: i.id,
      title: i.title,
      contextLabel: ctx.length > 0 ? ctx.join(' · ') : null,
      deadline: i.deadline,
      href: `/item/${i.id}`,
      progress,
      urgency: getUrgency(i.deadline, today),
      daysLeft: daysLeft(i.deadline, today),
    })
  }

  for (const s of steps) {
    const itemSteps = stepsByItem.get(s.item_id) ?? []
    const isModule = !s.parent_step_id
    const fullStep = itemSteps.find((x) => x.id === s.id)
    // Para módulos, `is_done` en DB es false aunque todas sus tareas estén
    // hechas (estado derivado). Excluimos los módulos efectivamente completos:
    // ya no son pendientes, así que no deberían aparecer como "vencidos".
    if (fullStep && isStepEffectivelyDone(fullStep, itemSteps)) continue
    const hasChildren = isModule && itemSteps.some((x) => x.parent_step_id === s.id)
    const ctx: string[] = []
    if (s.item) ctx.push(s.item.title)
    if (s.item?.status === 'paused') ctx.push('En pausa')
    entries.push({
      entityType: isModule ? 'module' : 'task',
      id: s.id,
      title: s.name,
      contextLabel: ctx.length > 0 ? ctx.join(' · ') : null,
      deadline: s.deadline,
      href: `/item/${s.item_id}`,
      progress: hasChildren && fullStep ? clamp01(computeStepProgress(fullStep, itemSteps)) : null,
      urgency: getUrgency(s.deadline, today),
      daysLeft: daysLeft(s.deadline, today),
    })
  }

  entries.sort(
    (a, b) => a.deadline.localeCompare(b.deadline) || a.title.localeCompare(b.title, 'es'),
  )

  return typeof opts.limit === 'number' ? entries.slice(0, opts.limit) : entries
}

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return n > 1 ? 1 : n
}
