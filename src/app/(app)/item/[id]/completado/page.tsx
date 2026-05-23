import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { formatDuration, formatDate } from '@/lib/format'
import { kindLabel } from '@/lib/items/constants'
import { CategoryBadge } from '@/components/category-badge'
import { Confetti } from '@/components/confetti'

export const metadata = { title: '¡Lo terminaste! · Why Not You?' }
export const dynamic = 'force-dynamic'

export default async function CompletadoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: item } = await supabase
    .from('items')
    .select('id, title, kind, total_units, unit_type, started_at, completed_at, status, category_id')
    .eq('id', id)
    .eq('user_id', user!.id)
    .maybeSingle()

  if (!item) notFound()
  if (item.status !== 'done') redirect(`/item/${id}`)

  // Stats: total sesiones y tiempo
  const { data: sessions } = await supabase
    .from('sessions')
    .select('duration_seconds')
    .eq('item_id', id)

  const totalSeconds = (sessions ?? []).reduce((a, b) => a + (b.duration_seconds ?? 0), 0)
  const sessionCount = (sessions ?? []).length
  const days = item.started_at && item.completed_at
    ? Math.max(
        1,
        Math.round(
          (new Date(item.completed_at).getTime() - new Date(item.started_at).getTime()) / 86400000,
        ),
      )
    : 1

  // Categoría
  let cat: { id: string; name: string; color: string; emoji: string | null } | null = null
  if (item.category_id) {
    const { data } = await supabase
      .from('categories')
      .select('id, name, color, emoji')
      .eq('id', item.category_id)
      .maybeSingle()
    cat = data
  }

  return (
    <div className="space-y-8 max-w-md mx-auto text-center py-8">
      <Confetti tier="large" trigger="completed" />

      <div className="space-y-2">
        <p className="text-5xl">✨</p>
        <h1 className="text-3xl font-semibold tracking-tight">¡Lo terminaste!</h1>
        <p className="text-muted">{kindLabel(item.kind)}</p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6 space-y-2">
        <p className="text-xl font-medium leading-tight">{item.title}</p>
        {cat && (
          <div className="flex justify-center">
            <CategoryBadge name={cat.name} color={cat.color} emoji={cat.emoji} size="md" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Días" value={String(days)} />
        <Stat label="Sesiones" value={String(sessionCount)} />
        <Stat label="Tiempo" value={formatDuration(totalSeconds)} />
      </div>

      {item.completed_at && (
        <p className="text-xs text-muted">
          Cerrado el {formatDate(item.completed_at)}.
        </p>
      )}

      <div className="flex items-center justify-center gap-3 pt-2">
        <Link
          href="/dashboard"
          className="rounded-lg bg-accent px-5 py-2.5 font-medium text-bg hover:opacity-90"
        >
          Al dashboard
        </Link>
        <Link href="/item/nuevo" className="text-sm text-muted hover:text-text">
          Empezar otro
        </Link>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-3">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className="tabular text-xl font-medium mt-0.5">{value}</p>
    </div>
  )
}
