'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSessionSchema } from '@/lib/items/schemas'
import { calculateHighlight, type Highlight } from '@/lib/highlights'

export type SessionResult =
  | { error: string }
  | { ok: true; itemCompleted: boolean; sessionId: string; highlight: Highlight }

export async function createSessionAction(input: {
  item_id: string
  started_at: string
  duration_seconds: number
  units_progressed: number
  note?: string
}): Promise<SessionResult> {
  const parsed = createSessionSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás iniciar sesión.' }

  const { data: item } = await supabase
    .from('items')
    .select('id, user_id, total_units, current_units')
    .eq('id', parsed.data.item_id)
    .single()

  if (!item || item.user_id !== user.id) {
    return { error: 'No encontramos ese ítem.' }
  }

  const { data: inserted, error } = await supabase
    .from('sessions')
    .insert({
      item_id: parsed.data.item_id,
      started_at: parsed.data.started_at,
      duration_seconds: parsed.data.duration_seconds,
      units_progressed: parsed.data.units_progressed,
      note: parsed.data.note || null,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    return { error: 'No pudimos guardar la sesión.' }
  }

  const newTotal = Number(item.current_units) + Number(parsed.data.units_progressed)
  const itemCompleted = newTotal >= Number(item.total_units)

  const highlight = await calculateHighlight(supabase, user.id, {
    itemId: parsed.data.item_id,
    durationSeconds: parsed.data.duration_seconds,
    itemCompleted,
  })

  revalidatePath('/dashboard')
  revalidatePath('/biblioteca')
  revalidatePath('/stats')
  revalidatePath('/categorias')
  revalidatePath(`/item/${parsed.data.item_id}`)

  return { ok: true, itemCompleted, sessionId: inserted.id, highlight }
}
