import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ProgressRing } from '@/components/progress-ring'
import { EmptyState } from '@/components/empty-state'
import { getGreeting } from '@/lib/greetings'
import { unitLabel } from '@/lib/items/constants'

export const metadata = { title: 'Hoy · Why Not You?' }
export const dynamic = 'force-dynamic'

type Item = {
  id: string
  title: string
  kind: string
  unit_type: string
  total_units: number
  current_units: number
  status: string
  updated_at: string
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: profile }, { data: streak }, { data: items }, { data: todayPickId }, { data: lastSession }] =
    await Promise.all([
      supabase.from('profiles').select('username, display_name, timezone').eq('id', user!.id).single(),
      supabase
        .from('streaks')
        .select('current, longest, freezes_available, last_active_date')
        .eq('user_id', user!.id)
        .single(),
      supabase
        .from('items')
        .select('id, title, kind, unit_type, total_units, current_units, status, updated_at')
        .eq('user_id', user!.id)
        .eq('status', 'active')
        .order('updated_at', { ascending: false }),
      supabase.rpc('pick_today_item'),
      supabase
        .from('sessions')
        .select('started_at, item_id, items!inner(user_id)')
        .eq('items.user_id', user!.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  const itemsList = (items ?? []) as Item[]
  const todayId = todayPickId as string | null
  const pickedItem = todayId ? itemsList.find((i) => i.id === todayId) : null
  const otherItems = todayId ? itemsList.filter((i) => i.id !== todayId) : itemsList

  const tz = profile?.timezone ?? 'UTC'
  const todayLocal = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
    .toISOString()
    .slice(0, 10)
  const hasSessionToday =
    !!lastSession?.started_at && new Date(lastSession.started_at).toISOString().slice(0, 10) === todayLocal
  const daysSinceLastSession = lastSession?.started_at
    ? Math.floor((Date.now() - new Date(lastSession.started_at).getTime()) / 86400000)
    : null

  const greeting = getGreeting({
    username: profile?.display_name || profile?.username || 'vos',
    hasSessionToday,
    streakDays: streak?.current ?? 0,
    daysSinceLastSession,
    activeItemCount: itemsList.length,
  })

  return (
    <div className="space-y-10">
      <section className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{greeting.title}</h1>
          <p className="text-muted text-sm mt-1.5">{greeting.subtitle}</p>
        </div>
        {streak && streak.current > 0 && (
          <div className="flex items-center gap-2 text-streak tabular shrink-0">
            <span className="text-lg">🔥</span>
            <span className="font-semibold text-xl">{streak.current}</span>
            <span className="text-xs text-muted">{streak.current === 1 ? 'día' : 'días'}</span>
          </div>
        )}
      </section>

      {itemsList.length === 0 && (
        <EmptyState
          title="Una sola cosa basta. Después agregás más."
          description="Empezá con lo que ya estás aprendiendo ahora."
          action={
            <Link
              href="/item/nuevo"
              className="inline-block rounded-lg bg-accent px-5 py-2.5 font-medium text-bg hover:opacity-90 transition-opacity"
            >
              Agregar mi primer ítem
            </Link>
          }
        />
      )}

      {pickedItem && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-muted">Hoy toca esto</h2>
          <ItemHero item={pickedItem} />
        </section>
      )}

      {otherItems.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            {pickedItem ? 'Otros en curso' : 'En curso'}
          </h2>
          <ul className="space-y-2">
            {otherItems.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      )}

      {itemsList.length > 0 && (
        <div className="flex justify-center pt-2">
          <Link
            href="/item/nuevo"
            className="text-sm text-muted hover:text-text transition-colors"
          >
            + Agregar otro ítem
          </Link>
        </div>
      )}
    </div>
  )
}

function ItemHero({ item }: { item: Item }) {
  const pct = Number(item.current_units) / Number(item.total_units)
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <Link href={`/item/${item.id}`} className="flex items-center gap-5 group">
        <ProgressRing value={pct} size={80} stroke={7} />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-lg leading-snug group-hover:text-accent transition-colors">
            {item.title}
          </h3>
          <p className="text-sm text-muted mt-1">
            {item.current_units} de {item.total_units} {unitLabel(item.unit_type, item.total_units)}
          </p>
        </div>
      </Link>
      <div className="mt-4">
        <Link
          href={`/item/${item.id}/sesion`}
          className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
        >
          Empezar sesión
        </Link>
      </div>
    </div>
  )
}

function ItemRow({ item }: { item: Item }) {
  const pct = Number(item.current_units) / Number(item.total_units)
  return (
    <li>
      <Link
        href={`/item/${item.id}`}
        className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 hover:bg-surface-2 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <ProgressRing value={pct} size={36} stroke={4} showLabel={false} />
          <div className="min-w-0">
            <p className="font-medium truncate">{item.title}</p>
            <p className="text-xs text-muted">
              {item.current_units} / {item.total_units} {unitLabel(item.unit_type, item.total_units)}
            </p>
          </div>
        </div>
        <span className="tabular text-sm text-muted shrink-0">{Math.round(pct * 100)}%</span>
      </Link>
    </li>
  )
}
