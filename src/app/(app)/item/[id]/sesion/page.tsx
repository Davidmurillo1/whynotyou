import { notFound, redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { unitLabel } from '@/lib/items/constants'
import { SessionRunner } from './session-runner'

export const dynamic = 'force-dynamic'

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: item }, { data: stepsRaw }] = await Promise.all([
    supabase
      .from('items')
      .select('id, title, unit_type, total_units, current_units, status')
      .eq('id', id)
      .eq('user_id', user!.id)
      .maybeSingle(),
    supabase
      .from('item_steps')
      .select('id, name, weight_pct, is_done, position, parent_step_id, progress_mode')
      .eq('item_id', id)
      .eq('user_id', user!.id)
      .order('position', { ascending: true }),
  ])

  if (!item) notFound()
  if (item.status === 'done') redirect(`/item/${id}`)

  const steps = (stepsRaw ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    weight_pct: Number(s.weight_pct),
    is_done: Boolean(s.is_done),
  }))

  return (
    <SessionRunner
      itemId={item.id}
      itemTitle={item.title}
      unitType={item.unit_type}
      unitLabelPlural={unitLabel(item.unit_type, 2)}
      currentUnits={Number(item.current_units)}
      totalUnits={Number(item.total_units)}
      steps={steps}
    />
  )
}
