'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSessionSchema } from '@/lib/items/schemas'
import { calculateHighlight, type Highlight } from '@/lib/highlights'

export type SessionResult =
  | { error: string }
  | { ok: true; itemCompleted: boolean; sessionId: string; highlight: Highlight }

/**
 * Registra una sesión de aprendizaje/trabajo.
 *
 * - Sin `step_id`: insert directo en `sessions` como antes.
 * - Con `step_id`: usa la RPC `create_session_with_step` para insertar la sesión
 *   y, si `complete_step = true`, marcar el paso como done atómicamente.
 *
 * Sobre `step_id` colgado: como la columna usa ON DELETE SET NULL, si en algún
 * momento se borra el paso referenciado, la sesión sobrevive con `step_id = null`
 * y sus minutos siguen contando para el scope del ítem. No hace falta limpieza.
 */
export async function createSessionAction(input: {
  item_id: string
  started_at: string
  duration_seconds: number
  units_progressed: number
  note?: string
  step_id?: string
  complete_step?: boolean
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

  const stepId = parsed.data.step_id ? String(parsed.data.step_id) : null
  const completeStep = Boolean(parsed.data.complete_step)

  let sessionId: string

  if (stepId) {
    // Camino atómico vía RPC: insert sesión + (opcional) marcar paso como done.
    const { data, error } = await supabase.rpc('create_session_with_step', {
      p_item_id: parsed.data.item_id,
      p_started_at: parsed.data.started_at,
      p_duration_seconds: parsed.data.duration_seconds,
      p_units_progressed: parsed.data.units_progressed,
      p_note: parsed.data.note || null,
      p_step_id: stepId,
      p_complete_step: completeStep,
    })
    if (error || !data) {
      if (error?.message?.includes('STEP_NOT_FOUND')) {
        return { error: 'Ese paso no pertenece a este ítem.' }
      }
      if (error?.message?.includes('ITEM_NOT_FOUND')) {
        return { error: 'No encontramos ese ítem.' }
      }
      return { error: 'No pudimos guardar la sesión.' }
    }
    sessionId = data as string
  } else {
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

  // Si el ítem tiene pasos, dejar que el modelo de pasos mande.
  const { data: steps } = await supabase
    .from('item_steps')
    .select('is_done')
    .eq('item_id', parsed.data.item_id)
  if (steps && steps.length > 0) {
    itemCompleted = steps.every((s) => Boolean(s.is_done))
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
