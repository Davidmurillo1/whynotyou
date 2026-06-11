import { createSupabaseServerClient } from '@/lib/supabase/server'
import { formatDuration } from '@/lib/format'
import {
  classifyIndex,
  effectiveItemEstimate,
  sessionEarnedMinutes,
  type EffectiveEstimate,
  type EstimateStepLike,
  EFFICIENCY_STATUS_LABEL,
} from '@/lib/efficiency/compute'
import {
  describeCompletionDelta,
  describeIndex,
  formatEffectiveEstimate,
} from '@/lib/efficiency/format'
import { EfficiencyChip } from '@/components/efficiency-bullet'
import { EfficiencyRangePicker, ALL_TIME_START } from './efficiency-range-picker'
import { EfficiencyTrendChart, type TrendPoint } from './efficiency-trend-chart'

type SessionRow = {
  id: string
  item_id: string
  started_at: string
  duration_seconds: number
  units_progressed: number
}

type ItemMeta = {
  id: string
  title: string
  status: string
  total_units: number
  steps_weight_mode: 'equal' | 'custom' | null
  estimated_minutes: number | null
}

/**
 * Sección "Eficiencia" de /stats (server component).
 *
 * Agrega las sesiones del rango [desde, hasta] (fechas locales en la timezone
 * del perfil) pertenecientes a ítems con estimación efectiva:
 *   - tiempo invertido = suma de duraciones
 *   - tiempo ganado    = earned-value por sesión (unidades o pasos completados)
 *   - índice           = ganado / invertido
 * Las sesiones de ítems sin estimación quedan fuera de ambas series y se
 * reportan como cobertura ("X h del período sin estimación").
 */
export async function EfficiencySection({
  userId,
  tz,
  today,
  desde,
  hasta,
}: {
  userId: string
  tz: string
  today: string
  desde: string
  hasta: string
}) {
  const supabase = await createSupabaseServerClient()

  // Instantes con padding de 1 día por delante y por detrás: cubren cualquier
  // timezone; el filtrado exacto por fecha local ocurre en memoria.
  const fromInstant = shiftDays(desde, -1) + 'T00:00:00Z'
  const toInstant = shiftDays(hasta, 2) + 'T00:00:00Z'
  const localDate = (instant: string) =>
    new Date(instant).toLocaleDateString('en-CA', { timeZone: tz })

  const [{ data: rangeSessionsRaw }, { data: doneItemsRaw }] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, item_id, started_at, duration_seconds, units_progressed, items!inner(user_id)')
      .eq('items.user_id', userId)
      .gte('started_at', fromInstant)
      .lt('started_at', toInstant)
      .order('started_at', { ascending: true }),
    supabase
      .from('items')
      .select('id, title, status, completed_at, total_units, steps_weight_mode, estimated_minutes')
      .eq('user_id', userId)
      .eq('status', 'done')
      .gte('completed_at', fromInstant)
      .lt('completed_at', toInstant),
  ])

  const rangeSessions: SessionRow[] = (rangeSessionsRaw ?? [])
    .map((s) => ({
      id: s.id as string,
      item_id: s.item_id as string,
      started_at: s.started_at as string,
      duration_seconds: Number(s.duration_seconds ?? 0),
      units_progressed: Number(s.units_progressed ?? 0),
    }))
    .filter((s) => {
      const d = localDate(s.started_at)
      return d >= desde && d <= hasta
    })

  const doneItems = (doneItemsRaw ?? []).filter((i) => {
    if (!i.completed_at) return false
    const d = localDate(i.completed_at as string)
    return d >= desde && d <= hasta
  })

  // Segunda pasada one-shot: metadatos de los ítems involucrados, sus pasos,
  // las asociaciones sesión↔paso del rango y el tiempo total de los completados.
  const sessionItemIds = [...new Set(rangeSessions.map((s) => s.item_id))]
  const doneItemIds = doneItems.map((i) => i.id as string)
  const allItemIds = [...new Set([...sessionItemIds, ...doneItemIds])]
  const sessionIds = rangeSessions.map((s) => s.id)

  const emptyResult = { data: [] as never[] }
  const [{ data: itemsMetaRaw }, { data: stepsRaw }, { data: linksRaw }, { data: doneTimeRaw }] =
    allItemIds.length > 0
      ? await Promise.all([
          supabase
            .from('items')
            .select('id, title, status, total_units, steps_weight_mode, estimated_minutes')
            .eq('user_id', userId)
            .in('id', allItemIds),
          supabase
            .from('item_steps')
            .select('id, item_id, weight_pct, is_done, parent_step_id, progress_mode, estimated_minutes')
            .eq('user_id', userId)
            .in('item_id', allItemIds),
          sessionIds.length > 0
            ? supabase
                .from('session_steps')
                .select('session_id, step_id, completed_in_session')
                .eq('user_id', userId)
                .in('session_id', sessionIds)
            : Promise.resolve(emptyResult),
          doneItemIds.length > 0
            ? supabase
                .from('sessions')
                .select('item_id, duration_seconds')
                .in('item_id', doneItemIds)
            : Promise.resolve(emptyResult),
        ])
      : [emptyResult, emptyResult, emptyResult, emptyResult]

  const metaById = new Map<string, ItemMeta>(
    (itemsMetaRaw ?? []).map((i) => [
      i.id as string,
      {
        id: i.id as string,
        title: i.title as string,
        status: i.status as string,
        total_units: Number(i.total_units),
        steps_weight_mode: (i.steps_weight_mode as 'equal' | 'custom' | null) ?? 'equal',
        estimated_minutes: i.estimated_minutes != null ? Number(i.estimated_minutes) : null,
      },
    ]),
  )
  const stepsByItem = new Map<string, EstimateStepLike[]>()
  for (const s of stepsRaw ?? []) {
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
  const estimateByItem = new Map<string, EffectiveEstimate | null>(
    [...metaById.values()].map((m) => [
      m.id,
      effectiveItemEstimate({ estimated_minutes: m.estimated_minutes }, stepsByItem.get(m.id)),
    ]),
  )
  const completedStepsBySession = new Map<string, string[]>()
  for (const l of (linksRaw ?? []) as Array<{
    session_id: string
    step_id: string
    completed_in_session: boolean
  }>) {
    if (!l.completed_in_session) continue
    const list = completedStepsBySession.get(l.session_id)
    if (list) list.push(l.step_id)
    else completedStepsBySession.set(l.session_id, [l.step_id])
  }

  // --- Agregación del período --------------------------------------------
  let investedMin = 0
  let earnedMin = 0
  let unestimatedMin = 0
  const byDay = new Map<string, { invested: number; earned: number }>()

  for (const s of rangeSessions) {
    const estimate = estimateByItem.get(s.item_id) ?? null
    const durMin = s.duration_seconds / 60
    if (!estimate) {
      unestimatedMin += durMin
      continue
    }
    const meta = metaById.get(s.item_id)
    if (!meta) continue
    const earned = sessionEarnedMinutes({
      estimateMinutes: estimate.minutes,
      totalUnits: meta.total_units,
      unitsProgressed: s.units_progressed,
      steps: stepsByItem.get(s.item_id) ?? [],
      completedStepIds: completedStepsBySession.get(s.id) ?? [],
      weightMode: meta.steps_weight_mode,
    })
    investedMin += durMin
    earnedMin += earned
    const day = localDate(s.started_at)
    const bucket = byDay.get(day) ?? { invested: 0, earned: 0 }
    bucket.invested += durMin
    bucket.earned += earned
    byDay.set(day, bucket)
  }

  const index = investedMin > 0 && earnedMin > 0 ? earnedMin / investedMin : null
  const status = index != null ? classifyIndex(index) : null

  // Serie acumulada día a día. Para "Todo" arrancamos en el primer día con
  // datos (no en 2000); muestreamos si el rango es enorme.
  const daysWithData = [...byDay.keys()].sort()
  let trend: TrendPoint[] = []
  if (daysWithData.length > 0) {
    const seriesStart = desde === ALL_TIME_START ? daysWithData[0] : desde
    const allDays = enumerateDays(seriesStart, hasta)
    const step = Math.max(1, Math.ceil(allDays.length / 400))
    let cumInvested = 0
    let cumEarned = 0
    const points: TrendPoint[] = []
    allDays.forEach((day, i) => {
      const bucket = byDay.get(day)
      if (bucket) {
        cumInvested += bucket.invested
        cumEarned += bucket.earned
      }
      if (i % step === 0 || i === allDays.length - 1) {
        points.push({
          date: day,
          invertido: Math.round(cumInvested),
          ganado: Math.round(cumEarned),
        })
      }
    })
    trend = points
  }

  // Ítems completados dentro del rango, con estimación efectiva.
  const doneSecondsByItem = new Map<string, number>()
  for (const r of (doneTimeRaw ?? []) as Array<{ item_id: string; duration_seconds: number }>) {
    doneSecondsByItem.set(
      r.item_id,
      (doneSecondsByItem.get(r.item_id) ?? 0) + Number(r.duration_seconds ?? 0),
    )
  }
  const completedRows = doneItems.flatMap((i) => {
    const itemId = i.id as string
    const estimate = estimateByItem.get(itemId)
    if (!estimate) return []
    const actualMin = (doneSecondsByItem.get(itemId) ?? 0) / 60
    if (actualMin <= 0) return []
    const itemIndex = estimate.minutes / actualMin
    return [
      {
        id: itemId,
        title: i.title as string,
        completedAt: i.completed_at as string,
        estimate,
        actualMin,
        status: classifyIndex(itemIndex),
        delta: describeCompletionDelta(estimate.minutes, actualMin),
      },
    ]
  })
  completedRows.sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1))

  const hasData = index != null || trend.length > 0 || completedRows.length > 0

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs uppercase tracking-wider text-muted">Eficiencia</h2>
        <EfficiencyRangePicker desde={desde} hasta={hasta} today={today} />
      </div>

      {!hasData ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center space-y-1.5">
          <p className="text-sm text-text">Sin datos de eficiencia en este período.</p>
          <p className="text-xs text-muted">
            Asigná un tiempo estimado a tus ítems (o a sus módulos) y registrá sesiones: acá vas
            a ver si los terminás más rápido o más lento que tu plan.
          </p>
          {unestimatedMin > 0 && (
            <p className="text-xs text-muted/80">
              Tenés {formatDuration(Math.round(unestimatedMin * 60))} registradas en el período,
              pero en ítems sin estimación.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-surface px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted">Índice del período</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="tabular text-2xl font-medium">
                  {index != null ? `${Math.round(index * 100)}%` : '—'}
                </p>
                {status && <EfficiencyChip status={status} />}
              </div>
              <p className="text-[11px] text-muted/80 mt-0.5">
                {index != null ? describeIndex(index) : EFFICIENCY_STATUS_LABEL.no_data}
              </p>
            </div>
            <KpiCard
              label="Tiempo invertido"
              value={formatDuration(Math.round(investedMin * 60))}
              hint="en ítems con estimación"
            />
            <KpiCard
              label="Tiempo ganado"
              value={formatDuration(Math.round(earnedMin * 60))}
              hint="avance × estimación"
            />
            {unestimatedMin > 0 ? (
              <KpiCard
                label="Sin estimación"
                value={formatDuration(Math.round(unestimatedMin * 60))}
                hint="fuera del índice"
              />
            ) : (
              <KpiCard
                label="Completados"
                value={String(completedRows.length)}
                hint="en el período"
              />
            )}
          </div>

          {trend.length > 1 && <EfficiencyTrendChart points={trend} />}

          {completedRows.length > 0 && (
            <div className="rounded-xl border border-border bg-surface px-4 py-3 space-y-2.5">
              <p className="text-[11px] uppercase tracking-wider text-muted">
                Completados en el período
              </p>
              <ul className="divide-y divide-border/60">
                {completedRows.map((r) => (
                  <li key={r.id} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-text truncate">{r.title}</p>
                      <p className="text-[11px] text-muted">{r.delta}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-muted tabular">
                        {formatDuration(Math.round(r.actualMin * 60))} /{' '}
                        {formatEffectiveEstimate(r.estimate)}
                      </span>
                      <EfficiencyChip status={r.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-3">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className="tabular text-2xl font-medium mt-1">{value}</p>
      {hint && <p className="text-[11px] text-muted/80 mt-0.5">{hint}</p>}
    </div>
  )
}

/** Suma días a una fecha YYYY-MM-DD con aritmética UTC. */
function shiftDays(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

function enumerateDays(from: string, to: string): string[] {
  const out: string[] = []
  let cursor = from
  // Tope duro de 5000 días como protección ante rangos absurdos.
  for (let i = 0; cursor <= to && i < 5000; i++) {
    out.push(cursor)
    cursor = shiftDays(cursor, 1)
  }
  return out
}

