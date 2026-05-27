import { createSupabaseServerClient } from '@/lib/supabase/server'
import { YearlyHeatmap } from './yearly-heatmap'
import { WeeklyChart, type WeekDay } from './weekly-chart'
import { CategoryBreakdown, type CategoryStat } from './category-breakdown'
import { formatDuration } from '@/lib/format'

export const metadata = { title: 'Stats · Why Not You?' }
export const dynamic = 'force-dynamic'

type DayMin = {
  local_date: string
  minutes: number
  minutes_study: number
  minutes_work: number
}

type SessionRow = {
  duration_seconds: number
  items: { user_id: string; scope: string; category_id: string | null } | { user_id: string; scope: string; category_id: string | null }[]
}

export default async function StatsPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const oneYearAgo = new Date()
  oneYearAgo.setDate(oneYearAgo.getDate() - 365)
  const cutoff = oneYearAgo.toISOString().slice(0, 10)

  const [
    { data: daily },
    { data: profile },
    { data: itemRows },
    { data: streak },
    { data: sessionStats },
    { data: categoryRows },
    { data: cats },
  ] = await Promise.all([
    supabase
      .from('daily_minutes')
      .select('local_date, minutes, minutes_study, minutes_work')
      .gte('local_date', cutoff)
      .order('local_date', { ascending: true })
      .returns<DayMin[]>(),
    supabase.from('profiles').select('timezone').eq('id', user!.id).single(),
    supabase.from('items').select('id, status, category_id, scope').eq('user_id', user!.id),
    supabase.from('streaks').select('current, longest').eq('user_id', user!.id).single(),
    supabase
      .from('sessions')
      .select('duration_seconds, items!inner(user_id, scope)')
      .eq('items.user_id', user!.id),
    supabase
      .from('sessions')
      .select('duration_seconds, items!inner(user_id, scope, category_id)')
      .eq('items.user_id', user!.id)
      .not('items.category_id', 'is', null),
    supabase
      .from('categories')
      .select('id, name, color, emoji, parent_id')
      .eq('user_id', user!.id),
  ])

  const days = daily ?? []
  const tz = profile?.timezone ?? 'UTC'
  const itemsArr = itemRows ?? []
  const hasWork = itemsArr.some((i) => i.scope === 'work')

  const today = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
  const monday = new Date(today)
  const dow = (today.getDay() + 6) % 7
  monday.setDate(today.getDate() - dow)
  const weekStart = monday.toISOString().slice(0, 10)

  const weekDays: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const iso = d.toISOString().slice(0, 10)
    const match = days.find((x) => x.local_date === iso)
    return {
      date: iso,
      minutesStudy: Math.round(Number(match?.minutes_study ?? 0)),
      minutesWork: Math.round(Number(match?.minutes_work ?? 0)),
    }
  })

  const weekTotalStudy = weekDays.reduce((a, b) => a + b.minutesStudy, 0)
  const weekTotalWork = weekDays.reduce((a, b) => a + b.minutesWork, 0)
  const weekTotal = weekTotalStudy + weekTotalWork
  const activeDays = days.filter((d) => Number(d.minutes) > 0).length

  // Tu camino hasta acá — totales por scope
  const sessions = (sessionStats ?? []) as SessionRow[]
  let totalStudySec = 0
  let totalWorkSec = 0
  let sessionsStudy = 0
  let sessionsWork = 0
  let longestSession = 0
  for (const row of sessions) {
    const rec = Array.isArray(row.items) ? row.items[0] : row.items
    const scope = rec?.scope ?? 'study'
    const dur = row.duration_seconds ?? 0
    if (scope === 'work') {
      totalWorkSec += dur
      sessionsWork += 1
    } else {
      totalStudySec += dur
      sessionsStudy += 1
    }
    if (dur > longestSession) longestSession = dur
  }
  const totalSeconds = totalStudySec + totalWorkSec
  const totalSessions = sessionsStudy + sessionsWork
  const itemsDone = itemsArr.filter((i) => i.status === 'done').length

  // Stats por categoría con desglose por scope
  const catMap = new Map((cats ?? []).map((c) => [c.id, c]))
  const acc = new Map<string, { study: number; work: number }>()
  for (const row of (categoryRows ?? []) as SessionRow[]) {
    const rec = Array.isArray(row.items) ? row.items[0] : row.items
    if (!rec?.category_id) continue
    const cat = catMap.get(rec.category_id)
    if (!cat) continue
    const rootId = cat.parent_id ?? cat.id
    const sec = row.duration_seconds ?? 0
    const entry = acc.get(rootId) ?? { study: 0, work: 0 }
    if (rec.scope === 'work') {
      entry.work += sec
    } else {
      entry.study += sec
    }
    acc.set(rootId, entry)
  }
  const categoryStats: CategoryStat[] = Array.from(acc.entries())
    .map(([rootId, sums]) => {
      const cat = catMap.get(rootId)
      const minutesStudy = Math.round(sums.study / 60)
      const minutesWork = Math.round(sums.work / 60)
      return {
        id: rootId,
        name: cat?.name ?? '—',
        color: cat?.color ?? '#8b93a1',
        emoji: cat?.emoji ?? null,
        minutes: minutesStudy + minutesWork,
        minutesStudy,
        minutesWork,
      }
    })
    .filter((c) => c.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Stats</h1>
        <p className="text-sm text-muted">Lo que hiciste, sin filtros.</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xs uppercase tracking-wider text-muted">Tu camino hasta acá</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <BigStat
            label="Racha máxima"
            value={`${streak?.longest ?? 0}`}
            hint={(streak?.longest ?? 0) === 1 ? 'día' : 'días'}
          />
          <BigStat
            label="Sesión más larga"
            value={formatDuration(longestSession)}
            hint="récord personal"
          />
          {hasWork ? (
            <>
              <BigStat
                label="Tiempo · Estudio"
                value={formatDuration(totalStudySec)}
                hint={`${sessionsStudy} ${sessionsStudy === 1 ? 'sesión' : 'sesiones'}`}
              />
              <BigStat
                label="Tiempo · Trabajo"
                value={formatDuration(totalWorkSec)}
                hint={`${sessionsWork} ${sessionsWork === 1 ? 'sesión' : 'sesiones'}`}
              />
            </>
          ) : (
            <>
              <BigStat
                label="Tiempo total"
                value={formatDuration(totalSeconds)}
                hint={`en ${totalSessions} sesiones`}
              />
              <BigStat
                label="Ítems cerrados"
                value={String(itemsDone)}
                hint={itemsDone === 1 ? 'completado' : 'completados'}
              />
            </>
          )}
        </div>
        {hasWork && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <BigStat
              label="Tiempo total"
              value={formatDuration(totalSeconds)}
              hint={`en ${totalSessions} sesiones`}
            />
            <BigStat
              label="Ítems cerrados"
              value={String(itemsDone)}
              hint={itemsDone === 1 ? 'completado' : 'completados'}
            />
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xs uppercase tracking-wider text-muted">Últimos 12 meses</h2>
        <YearlyHeatmap
          days={days.map((d) => ({ date: d.local_date, minutes: Number(d.minutes) }))}
          tz={tz}
        />
        <p className="text-sm text-muted">
          {activeDays === 0
            ? 'Empezá hoy y este cuadrito se va a ver distinto en un mes.'
            : hasWork
              ? `${activeDays} ${activeDays === 1 ? 'día' : 'días'} con actividad.`
              : `${activeDays} ${activeDays === 1 ? 'día' : 'días'} con estudio.`}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xs uppercase tracking-wider text-muted">
          Esta semana — desde el{' '}
          {new Date(weekStart).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
        </h2>
        <WeeklyChart days={weekDays} hasWork={hasWork} />
        {hasWork ? (
          <div className="text-sm text-muted space-x-3">
            <span>
              Estudio: <span className="text-text tabular">{formatDuration(weekTotalStudy * 60)}</span>
            </span>
            <span>
              Trabajo: <span className="text-text tabular">{formatDuration(weekTotalWork * 60)}</span>
            </span>
            <span>
              Total: <span className="text-text tabular">{formatDuration(weekTotal * 60)}</span>
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Total: <span className="text-text tabular">{formatDuration(weekTotal * 60)}</span>
          </p>
        )}
      </section>

      {categoryStats.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">Por categoría</h2>
          <CategoryBreakdown stats={categoryStats} hasWork={hasWork} />
        </section>
      )}
    </div>
  )
}

function BigStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-3">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className="tabular text-2xl font-medium mt-1">{value}</p>
      {hint && <p className="text-[11px] text-muted/80 mt-0.5">{hint}</p>}
    </div>
  )
}
