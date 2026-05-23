import type { SupabaseClient } from '@supabase/supabase-js'

export type Highlight = {
  kind:
    | 'first_session'
    | 'first_item_done'
    | 'best_month_session'
    | 'streak_milestone'
    | 'week_better'
    | 'consistent_with_item'
    | null
  text: string
}

const NO_HIGHLIGHT: Highlight = { kind: null, text: '' }

const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100]

export async function calculateHighlight(
  supabase: SupabaseClient,
  userId: string,
  ctx: {
    itemId: string
    durationSeconds: number
    itemCompleted: boolean
  },
): Promise<Highlight> {
  // 1) Primer ítem terminado de la historia → high impact
  if (ctx.itemCompleted) {
    const { count } = await supabase
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'done')
    if ((count ?? 0) <= 1) {
      return { kind: 'first_item_done', text: 'Tu primer ítem cerrado. El siguiente cuesta menos.' }
    }
    return { kind: 'first_item_done', text: 'Cerraste otro ítem. Esto ya es ritmo.' }
  }

  // 2) Milestone de racha
  const { data: streak } = await supabase
    .from('streaks')
    .select('current')
    .eq('user_id', userId)
    .single()
  const current = streak?.current ?? 0
  if (STREAK_MILESTONES.includes(current)) {
    return { kind: 'streak_milestone', text: `${current} días seguidos. Esto ya es identidad, no esfuerzo.` }
  }

  // 3) Mejor sesión del mes
  const monthAgo = new Date()
  monthAgo.setDate(monthAgo.getDate() - 30)
  const { data: maxRow } = await supabase
    .from('sessions')
    .select('duration_seconds, items!inner(user_id)')
    .eq('items.user_id', userId)
    .gte('started_at', monthAgo.toISOString())
    .order('duration_seconds', { ascending: false })
    .limit(1)
    .maybeSingle()
  const maxDuration = (maxRow?.duration_seconds as number | undefined) ?? 0
  if (ctx.durationSeconds > 0 && ctx.durationSeconds >= maxDuration) {
    return { kind: 'best_month_session', text: 'Tu sesión más larga del mes.' }
  }

  // 4) Semana mejor que la pasada
  const today = new Date()
  const dayOfWeek = (today.getDay() + 6) % 7
  const monday = new Date(today)
  monday.setDate(today.getDate() - dayOfWeek)
  monday.setHours(0, 0, 0, 0)
  const lastMonday = new Date(monday)
  lastMonday.setDate(monday.getDate() - 7)

  const { data: weekRows } = await supabase
    .from('sessions')
    .select('started_at, duration_seconds, items!inner(user_id)')
    .eq('items.user_id', userId)
    .gte('started_at', lastMonday.toISOString())

  let thisWeekSec = 0
  let prevWeekSec = 0
  for (const r of weekRows ?? []) {
    const t = new Date(r.started_at).getTime()
    if (t >= monday.getTime()) thisWeekSec += r.duration_seconds
    else if (t >= lastMonday.getTime()) prevWeekSec += r.duration_seconds
  }
  if (prevWeekSec > 0 && thisWeekSec > prevWeekSec) {
    const diffMin = Math.round((thisWeekSec - prevWeekSec) / 60)
    if (diffMin >= 5) {
      return {
        kind: 'week_better',
        text: `Esta semana ya sumaste ${diffMin} min más que la pasada.`,
      }
    }
  }

  // 5) Constancia con el mismo ítem
  const { count: itemSessions } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('item_id', ctx.itemId)
  if (itemSessions === 1) {
    return { kind: 'first_session', text: 'Primera sesión con esto. La más difícil.' }
  }
  if (itemSessions && itemSessions > 1 && itemSessions % 5 === 0) {
    return {
      kind: 'consistent_with_item',
      text: `${itemSessions} sesiones con este ítem.`,
    }
  }

  return NO_HIGHLIGHT
}
