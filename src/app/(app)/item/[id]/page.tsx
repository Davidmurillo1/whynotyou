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
import { todayInTimezone } from '@/lib/deadlines/utils'
import { computeItemProgress, isStepEffectivelyDone } from '@/lib/items/progress'
import {
  attributeSessionTimeToSteps,
  computeEfficiency,
  computeStepProgress,
  effectiveItemEstimate,
  effectiveStepEstimate,
  stepActualSeconds,
} from '@/lib/efficiency/compute'
import { ItemActions } from './item-actions'
import { ItemCategoryEditor } from './item-category-editor'
import { ItemScopeEditor } from './item-scope-editor'
import { ItemDetailsEditor } from './item-details-editor'
import { ItemProgressShell } from './item-progress-shell'
import { ItemProjectsEditor } from './item-projects-editor'
import { ItemEfficiencySection, type ModuleEfficiency } from './item-efficiency-section'
import { type Step } from './steps-editor'
import { type Note } from '@/components/notes-control'

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

  const [
    { data: item },
    { data: sessions },
    { data: allSessions },
    { data: stepLinks },
    { data: cats },
    { data: stepsRaw },
    { data: itemProjectRows },
    { data: profile },
    { data: notesRaw },
  ] = await Promise.all([
    supabase
      .from('items')
      .select(
        'id, title, kind, unit_type, total_units, current_units, status, source_url, started_at, completed_at, category_id, scope, steps_weight_mode, deadline, estimated_minutes',
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
    // Todas las sesiones del ítem (solo duración) para el tiempo real total
    // de la sección de eficiencia.
    supabase.from('sessions').select('id, duration_seconds').eq('item_id', id),
    // Asociaciones sesión↔paso del ítem, para atribuir tiempo por módulo.
    supabase
      .from('session_steps')
      .select('session_id, step_id, sessions!inner(item_id)')
      .eq('user_id', user!.id)
      .eq('sessions.item_id', id),
    supabase
      .from('categories')
      .select('id, name, color, emoji, parent_id')
      .eq('user_id', user!.id)
      .order('order_index', { ascending: true }),
    supabase
      .from('item_steps')
      .select(
        'id, name, weight_pct, position, is_done, parent_step_id, progress_mode, deadline, estimated_minutes',
      )
      .eq('item_id', id)
      .eq('user_id', user!.id)
      .order('position', { ascending: true }),
    // Solo los proyectos a los que pertenece este ítem (join PostgREST).
    // El picker para gestionar pertenencia se carga lazy desde el cliente.
    supabase
      .from('project_items')
      .select('project:projects!inner(id, name, color, emoji, status)')
      .eq('item_id', id)
      .eq('user_id', user!.id),
    supabase.from('profiles').select('timezone').eq('id', user!.id).single(),
    // Todas las notas del ítem y de sus pasos en una sola query: el `item_id`
    // está denormalizado en TODA nota (también las de paso), así que filtrar por
    // item_id trae ítem + módulos + tareas sin depender de los step ids ni de
    // una 2da pasada. Se particiona en memoria (step_id null = nota del ítem).
    supabase
      .from('item_notes')
      .select('id, item_id, step_id, body, created_at')
      .eq('item_id', id)
      .eq('user_id', user!.id)
      .order('created_at', { ascending: true }),
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
    deadline: (s.deadline as string | null) ?? null,
    estimated_minutes: s.estimated_minutes != null ? Number(s.estimated_minutes) : null,
  }))

  // Notas del ítem y de sus pasos. La shell las mantiene en un único estado
  // controlled y las particiona por `step_id` (null = nota del ítem).
  const notes: Note[] = (notesRaw ?? []).map((n) => ({
    id: n.id as string,
    item_id: n.item_id as string,
    step_id: (n.step_id as string | null) ?? null,
    body: n.body as string,
    created_at: n.created_at as string,
  }))

  const today = todayInTimezone(profile?.timezone)
  const hasSteps = steps.length > 0
  const currentCat = item.category_id ? (cats ?? []).find((c) => c.id === item.category_id) : null
  const scope: ItemScope = (item.scope as ItemScope) ?? 'study'

  // --- Eficiencia: estimado vs. real -------------------------------------
  const itemEstimatedMinutes =
    item.estimated_minutes != null ? Number(item.estimated_minutes) : null
  const itemEstimate = effectiveItemEstimate({ estimated_minutes: itemEstimatedMinutes }, steps)
  const totalActualSeconds = (allSessions ?? []).reduce(
    (acc, s) => acc + Number(s.duration_seconds ?? 0),
    0,
  )
  const itemProgress = computeItemProgress(
    {
      current_units: Number(item.current_units),
      total_units: Number(item.total_units),
      steps_weight_mode: (item.steps_weight_mode as 'equal' | 'custom' | null) ?? 'equal',
    },
    steps,
  )
  const itemEfficiency = itemEstimate
    ? computeEfficiency({
        progress: itemProgress,
        estimateMinutes: itemEstimate.minutes,
        actualSeconds: totalActualSeconds,
        completed: item.status === 'done',
      })
    : null

  // Desglose por módulo: tiempo atribuido (reparto igualitario por sesión)
  // vs. estimación efectiva de cada módulo raíz.
  const attributedSeconds = attributeSessionTimeToSteps(
    (allSessions ?? []).map((s) => ({
      id: s.id as string,
      duration_seconds: Number(s.duration_seconds ?? 0),
    })),
    ((stepLinks ?? []) as Array<{ session_id: string; step_id: string }>).map((l) => ({
      session_id: l.session_id,
      step_id: l.step_id,
    })),
  )
  const rootSteps = steps.filter((s) => !s.parent_step_id)
  const moduleEfficiencies: ModuleEfficiency[] = rootSteps.flatMap((root) => {
    const estimate = effectiveStepEstimate(root, steps)
    if (!estimate) return []
    return [
      {
        id: root.id,
        name: root.name,
        estimate,
        efficiency: computeEfficiency({
          progress: computeStepProgress(root, steps),
          estimateMinutes: estimate.minutes,
          actualSeconds: stepActualSeconds(root, steps, attributedSeconds),
          completed: isStepEffectivelyDone(root, steps),
        }),
      },
    ]
  })
  const unestimatedModuleCount = rootSteps.length - moduleEfficiencies.length
  // ------------------------------------------------------------------------

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
          deadline: (item.deadline as string | null) ?? null,
        }}
        today={today}
        category={
          currentCat
            ? { id: currentCat.id, name: currentCat.name, color: currentCat.color, emoji: currentCat.emoji }
            : null
        }
        initialSteps={steps}
        initialNotes={notes}
        itemActions={<ItemActions itemId={item.id} status={item.status} />}
      />

      <ItemEfficiencySection
        estimate={itemEstimate}
        efficiency={itemEfficiency}
        modules={moduleEfficiencies}
        unestimatedModuleCount={unestimatedModuleCount}
      />

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted">Tipo de proyecto</h2>
        <ItemScopeEditor itemId={item.id} currentScope={scope} />
      </section>

      <section id="detalles" className="space-y-3 scroll-mt-20">
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
            deadline: (item.deadline as string | null) ?? null,
            estimated_minutes: itemEstimatedMinutes,
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
        <h2 className="text-xs uppercase tracking-wider text-muted">Proyectos</h2>
        <ItemProjectsEditor
          itemId={item.id}
          currentProjects={((itemProjectRows ?? []) as unknown as Array<{
            project: {
              id: string
              name: string
              color: string
              emoji: string | null
              status: 'active' | 'archived'
            } | null
          }>)
            .map((r) => r.project)
            .filter((p): p is NonNullable<typeof p> => p !== null)
            .map((p) => ({
              id: p.id,
              name: p.name,
              color: p.color,
              emoji: p.emoji,
              status: p.status,
            }))}
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
