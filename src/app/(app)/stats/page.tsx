import { createSupabaseServerClient } from '@/lib/supabase/server'
import { YearlyHeatmap } from './yearly-heatmap'
import { WeeklyChart } from './weekly-chart'
import { CategoryBreakdown } from './category-breakdown'
import { formatDuration } from '@/lib/format'

export const metadata = { title: 'Stats · Why Not You?' }
export const dynamic = 'force-dynamic'

type DayMin = { local_date: string; minutes: number }

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
    { data: categoryMinutes },
    { data: cats },
  ] = await Promise.all([
    supabase
      .from('daily_minutes')
      .select('local_date, minutes')
      .gte('local_date', cutoff)
      .order('local_date', { ascending: true })
      .returns<DayMin[]>(),
    supabase.from('profiles').select('timezone').eq('id', user!.id).single(),
    supabase.from('items').select('id, status, category_id').eq('user_id', user!.id),
    supabase.from('streaks').select('current, longest').eq('user_id', user!.id).single(),
    supabase
      .from('sessions')
      .select('duration_seconds, items!inner(user_id)')
      .eq('items.user_id', user!.id),
    supabase
      .from('sessions')
      .select('duration_seconds, items!inner(user_id, category_id)')
      .eq('items.user_id', user!.id)
      .not('items.category_id', 'is', null),
    supabase
      .from('categories')
      .select('id, name, color, emoji, parent_id')
      .eq('user_id', user!.id),
  ])

  const days = daily ?? []
  const tz = profile?.timezone ?? 'UTC'

  const today = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
  const monday = new Date(today)
  const dow = (today.getDay() + 6) % 7
  monday.setDate(today.getDate() - dow)
  const weekStart = monday.toISOString().slice(0, 10)

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const iso = d.toISOString().slice(0, 10)
    const match = days.find((x) => x.local_date === iso)
    return { date: iso, minutes: Number(match?.minutes ?? 0) }
  })

  const weekTotal = weekDays.reduce((a, b) => a + b.minutes, 0)
  const activeDays = days.filter((d) => Number(d.minutes) > 0).length

  // Tu camino hasta acá
  const totalSeconds = (sessionStats ?? []).reduce((a, b) => a + (b.duration_seconds ?? 0), 0)
  const longestSession = Math.max(0, ...(sessionStats ?? []).map((s) => s.duration_seconds))
  const itemsDone = (itemRows ?? []).filter((i) => i.status === 'done').length
  const totalSessions = (sessionStats ?? []).length

  // Stats por categoría (agrupando subcategorías en su raíz)
  const catMap = new Map((cats ?? []).map((c) => [c.id, c]))
  const minutesByRoot = new Map<string, number>()
  for (const row of categoryMinutes ?? []) {
    const items = row.items as unknown as { category_id: string } | { category_id: string }[]
    // Supabase Postgrest puede devolver objeto u array según el shape — normalizamos
    const rec = Array.isArray(items) ? items[0] : items
    if (!rec?.category_id) continue
    const cat = catMap.get(rec.category_id)
    if (!cat) continue
    const rootId = cat.parent_id ?? cat.id
    minutesByRoot.set(rootId, (minutesByRoot.get(rootId) ?? 0) + (row.duration_seconds ?? 0))
  }
  const categoryStats = Array.from(minutesByRoot.entries())
    .map(([rootId, sec]) => {
      const cat = catMap.get(rootId)
      return {
        id: rootId,
        name: cat?.name ?? '—',
        color: cat?.color ?? '#8b93a1',
        emoji: cat?.emoji ?? null,
        minutes: Math.round(sec / 60),
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
          <BigStat label="Racha máxima" value={`${streak?.longest ?? 0}`} hint={(streak?.longest ?? 0) === 1 ? 'día' : 'días'} />
          <BigStat label="Sesión más larga" value={formatDuration(longestSession)} hint="récord personal" />
          <BigStat label="Tiempo total" value={formatDuration(totalSeconds)} hint={`en ${totalSessions} sesiones`} />
          <BigStat label="Ítems cerrados" value={String(itemsDone)} hint={itemsDone === 1 ? 'completado' : 'completados'} />
        </div>
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
            : `${activeDays} ${activeDays === 1 ? 'día' : 'días'} con estudio.`}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xs uppercase tracking-wider text-muted">
          Esta semana — desde el {new Date(weekStart).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
        </h2>
        <WeeklyChart days={weekDays} />
        <p className="text-sm text-muted">
          Total: <span className="text-text tabular">{formatDuration(weekTotal * 60)}</span>
        </p>
      </section>

      {categoryStats.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">Por categoría</h2>
          <CategoryBreakdown stats={categoryStats} />
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
