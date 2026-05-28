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
  steps?: Array<{ step_id: string; complete: boolean }>
  /** @deprecated usar steps */
  step_id?: string
  /** @deprecated usar steps */
  complete_step?: boolean
}): Promise<SessionResult> {
  // Retrocompat: si llega el par viejo (step_id + complete_step) y no hay steps,
  // lo normalizamos al nuevo formato.
  let normalizedInput = input
  if (!input.steps && input.step_id) {
    normalizedInput = {
      ...input,
      steps: [{ step_id: input.step_id, complete: Boolean(input.complete_step) }],
    }
  }

  const parsed = createSessionSchema.safeParse(normalizedInput)
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

  const steps = parsed.data.steps ?? []
  let sessionId: string

  if (steps.length > 0) {
    // Camino atómico vía RPC: insert sesión + asociaciones + (opcional) marcar pasos.
    const { data, error } = await supabase.rpc('create_session_with_steps', {
      p_item_id: parsed.data.item_id,
      p_started_at: parsed.data.started_at,
      p_duration_seconds: parsed.data.duration_seconds,
      p_units_progressed: parsed.data.units_progressed,
      p_note: parsed.data.note || null,
      p_steps: steps.map((s) => ({ step_id: s.step_id, complete: s.complete })),
    })
    if (error || !data) {
      if (error?.message?.includes('STEP_NOT_FOUND')) {
        return { error: 'Ese paso no pertenece a este ítem.' }
      }
      if (error?.message?.includes('ITEM_NOT_FOUND')) {
        return { error: 'No encontramos ese ítem.' }
      }
      if (error?.message?.includes('ITEM_NOT_OWNED')) {
        return { error: 'No encontramos ese ítem.' }
      }
      return { error: 'No pudimos guardar la sesión.' }
    }
    sessionId = data as string
  } else {
    // Sin pasos: insert directo en sessions.
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
    sessionId = inserted.id
  }

  // ¿Está completo el ítem? Dos vías:
  //  (a) por unidades: la suma supera el total.
  //  (b) por pasos: si tiene pasos, todos deben estar done.
  const newTotalUnits = Number(item.current_units) + Number(parsed.data.units_progressed)
  let itemCompleted = newTotalUnits >= Number(item.total_units)

  const { data: stepsRows } = await supabase
    .from('item_steps')
    .select('is_done')
    .eq('item_id', parsed.data.item_id)
  if (stepsRows && stepsRows.length > 0) {
    itemCompleted = stepsRows.every((s) => Boolean(s.is_done))
  }

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

  return { ok: true, itemCompleted, sessionId, highlight }
}
