'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createNoteSchema, updateNoteSchema, deleteNoteSchema } from '@/lib/notes/schemas'

export type NoteRow = {
  id: string
  item_id: string
  step_id: string | null
  body: string
  created_at: string
}

export type NoteActionResult =
  | { ok: true; note?: NoteRow }
  | { error: string }

/** Mapeo de errores del trigger `check_item_note_ownership` → español. */
function mapPgError(error: { message: string; code?: string; hint?: string | null }): string {
  if (error.message?.includes('NOTE_ITEM_OWNERSHIP_MISMATCH')) {
    return 'Ese ítem no te pertenece.'
  }
  if (error.message?.includes('NOTE_STEP_OWNERSHIP_MISMATCH')) {
    return 'Ese paso no te pertenece.'
  }
  if (error.message?.includes('NOTE_STEP_ITEM_MISMATCH')) {
    return 'El paso pertenece a otro ítem.'
  }
  if (error.hint) return error.hint
  return 'No pudimos guardar la nota.'
}

/** Crea una nota sobre un ítem, un módulo o una tarea.
 *
 *  Si llega `step_id`, el `item_id` se DERIVA del paso (autoritativo) — no se
 *  confía en el `item_id` del cliente. Si no llega `step_id`, es una nota de
 *  nivel ítem y se verifica ownership del ítem. */
export async function createNoteAction(input: {
  item_id: string
  step_id?: string | null
  body: string
}): Promise<NoteActionResult> {
  const parsed = createNoteSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás iniciar sesión.' }

  const stepId = parsed.data.step_id ?? null
  let itemId = parsed.data.item_id

  if (stepId) {
    // Derivar item_id del paso (autoritativo). Verifica ownership de paso.
    const { data: step } = await supabase
      .from('item_steps')
      .select('id, item_id')
      .eq('id', stepId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!step) return { error: 'No encontramos ese paso.' }
    itemId = step.item_id as string
  } else {
    // Nota de nivel ítem: verificar ownership del ítem.
    const { data: item } = await supabase
      .from('items')
      .select('id')
      .eq('id', itemId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!item) return { error: 'No encontramos ese ítem.' }
  }

  const { data: inserted, error } = await supabase
    .from('item_notes')
    .insert({
      user_id: user.id,
      item_id: itemId,
      step_id: stepId,
      body: parsed.data.body,
    })
    .select('id, item_id, step_id, body, created_at')
    .single()
  if (error || !inserted) return { error: mapPgError(error ?? { message: 'insert_failed' }) }

  revalidatePath(`/item/${itemId}`)
  return {
    ok: true,
    note: {
      id: inserted.id as string,
      item_id: inserted.item_id as string,
      step_id: (inserted.step_id as string | null) ?? null,
      body: inserted.body as string,
      created_at: inserted.created_at as string,
    },
  }
}

/** Edita el cuerpo de una nota. Filtra por `user_id`; el trigger `touch`
 *  actualiza `updated_at`. */
export async function updateNoteAction(input: {
  id: string
  body: string
}): Promise<NoteActionResult> {
  const parsed = updateNoteSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás iniciar sesión.' }

  const { data: updated, error } = await supabase
    .from('item_notes')
    .update({ body: parsed.data.body })
    .eq('id', parsed.data.id)
    .eq('user_id', user.id)
    .select('id, item_id, step_id, body, created_at')
    .single()
  if (error || !updated) return { error: mapPgError(error ?? { message: 'update_failed' }) }

  revalidatePath(`/item/${updated.item_id as string}`)
  return {
    ok: true,
    note: {
      id: updated.id as string,
      item_id: updated.item_id as string,
      step_id: (updated.step_id as string | null) ?? null,
      body: updated.body as string,
      created_at: updated.created_at as string,
    },
  }
}

/** Borra una nota. Filtra por `user_id` (defensa en profundidad además de RLS). */
export async function deleteNoteAction(input: { id: string }): Promise<NoteActionResult> {
  const parsed = deleteNoteSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás iniciar sesión.' }

  // Traemos item_id para revalidar + confirmar ownership.
  const { data: note } = await supabase
    .from('item_notes')
    .select('item_id')
    .eq('id', parsed.data.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!note) return { error: 'No encontramos esa nota.' }

  const { error } = await supabase
    .from('item_notes')
    .delete()
    .eq('id', parsed.data.id)
    .eq('user_id', user.id)
  if (error) return { error: mapPgError(error) }

  revalidatePath(`/item/${note.item_id as string}`)
  return { ok: true }
}
