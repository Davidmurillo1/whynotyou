'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  createStepSchema,
  updateStepSchema,
  reorderStepsSchema,
  deleteStepSchema,
  toggleStepSchema,
  type ProgressMode,
} from '@/lib/items/steps-schemas'

export type StepRow = {
  id: string
  name: string
  weight_pct: number
  position: number
  is_done: boolean
  parent_step_id: string | null
  progress_mode: ProgressMode
}

export type StepActionResult =
  | { ok: true; step?: StepRow }
  | { error: string }

/**
 * Mapeo de errores comunes de Postgres → mensaje en español.
 *
 * Nota histórica: en una versión anterior había un trigger `check_steps_sum_pct`
 * que exigía suma = 100. Se eliminó porque cada server action es su propia
 * transacción HTTP, así que el `DEFERRABLE INITIALLY DEFERRED` no podía amortiguar
 * inserts incrementales del usuario. Ahora los pesos son relativos.
 *
 * El trigger `check_step_parent_depth` sigue activo y rechaza anidar tareas
 * dentro de tareas (max 1 nivel de anidación: módulo -> tareas).
 */
function mapPgError(error: { message: string; code?: string; hint?: string | null }): string {
  if (error.message?.includes('STEP_NESTING_TOO_DEEP')) {
    return 'Los pasos solo se anidan un nivel (módulo → tareas).'
  }
  if (error.message?.includes('STEP_PARENT_ITEM_MISMATCH')) {
    return 'El paso padre tiene que pertenecer al mismo ítem.'
  }
  if (error.hint) return error.hint
  return 'No pudimos guardar los cambios.'
}

function revalidateItem(itemId: string) {
  revalidatePath(`/item/${itemId}`)
  revalidatePath('/dashboard')
  revalidatePath('/biblioteca')
  revalidatePath('/stats')
}

/** Crea un nuevo paso. Si no llega `position`, lo agrega al final del nivel
 *  correspondiente (raíz o dentro de un módulo padre).
 *
 *  Si `parent_step_id` llega, el paso se crea como tarea hija de ese módulo.
 *  El trigger DB garantiza que el padre sea un paso raíz (1 solo nivel).
 *
 *  `progress_mode` solo tiene efecto si el paso termina teniendo hijos. */
export async function createStepAction(input: {
  item_id: string
  name: string
  weight_pct: number
  position?: number
  parent_step_id?: string
  progress_mode?: ProgressMode
}): Promise<StepActionResult> {
  const parsed = createStepSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás iniciar sesión.' }

  // Verificar ownership del ítem (defensa en profundidad además de RLS)
  const { data: item } = await supabase
    .from('items')
    .select('id')
    .eq('id', parsed.data.item_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!item) return { error: 'No encontramos ese ítem.' }

  const parentId = parsed.data.parent_step_id ?? null

  // Si llega parent_step_id, validamos en el server que sea raíz (defensa
  // adicional al trigger DB) y que pertenezca al mismo ítem.
  if (parentId) {
    const { data: parent } = await supabase
      .from('item_steps')
      .select('id, item_id, parent_step_id')
      .eq('id', parentId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!parent) return { error: 'No encontramos el paso padre.' }
    if (parent.item_id !== parsed.data.item_id) {
      return { error: 'El paso padre pertenece a otro ítem.' }
    }
    if (parent.parent_step_id) {
      return { error: 'Los pasos solo se anidan un nivel (módulo → tareas).' }
    }
  }

  // Si no vino position, lo ponemos al final del nivel correspondiente:
  //   - tareas hijas → al final del módulo padre
  //   - pasos raíz → al final del nivel raíz
  let position = parsed.data.position
  if (position === undefined) {
    let posQuery = supabase
      .from('item_steps')
      .select('position')
      .eq('item_id', parsed.data.item_id)
      .order('position', { ascending: false })
      .limit(1)
    posQuery = parentId
      ? posQuery.eq('parent_step_id', parentId)
      : posQuery.is('parent_step_id', null)
    const { data: max } = await posQuery.maybeSingle()
    position = max ? Number(max.position) + 1 : 0
  }

  const insertPayload: Record<string, unknown> = {
    item_id: parsed.data.item_id,
    user_id: user.id,
    name: parsed.data.name,
    weight_pct: parsed.data.weight_pct,
    position,
    parent_step_id: parentId,
  }
  if (parsed.data.progress_mode !== undefined) {
    insertPayload.progress_mode = parsed.data.progress_mode
  }

  const { data: inserted, error } = await supabase
    .from('item_steps')
    .insert(insertPayload)
    .select('id, name, weight_pct, position, is_done, parent_step_id, progress_mode')
    .single()
  if (error || !inserted) return { error: mapPgError(error ?? { message: 'insert_failed' }) }

  revalidateItem(parsed.data.item_id)
  return {
    ok: true,
    step: {
      id: inserted.id as string,
      name: inserted.name as string,
      weight_pct: Number(inserted.weight_pct),
      position: Number(inserted.position),
      is_done: Boolean(inserted.is_done),
      parent_step_id: (inserted.parent_step_id as string | null) ?? null,
      progress_mode: ((inserted.progress_mode as ProgressMode | null) ?? 'weighted'),
    },
  }
}

/** Edita parcialmente un paso (nombre, peso, posición, is_done). */
export async function updateStepAction(input: {
  id: string
  name?: string
  weight_pct?: number
  position?: number
  is_done?: boolean
  progress_mode?: ProgressMode
}): Promise<StepActionResult> {
  const parsed = updateStepSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás iniciar sesión.' }

  // Necesitamos el item_id para revalidar
  const { data: step } = await supabase
    .from('item_steps')
    .select('item_id')
    .eq('id', parsed.data.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!step) return { error: 'No encontramos ese paso.' }

  const patch: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) patch.name = parsed.data.name
  if (parsed.data.weight_pct !== undefined) patch.weight_pct = parsed.data.weight_pct
  if (parsed.data.position !== undefined) patch.position = parsed.data.position
  if (parsed.data.is_done !== undefined) {
    patch.is_done = parsed.data.is_done
    patch.done_at = parsed.data.is_done ? new Date().toISOString() : null
  }
  if (parsed.data.progress_mode !== undefined) {
    patch.progress_mode = parsed.data.progress_mode
  }

  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await supabase
    .from('item_steps')
    .update(patch)
    .eq('id', parsed.data.id)
    .eq('user_id', user.id)
  if (error) return { error: mapPgError(error) }

  revalidateItem(step.item_id as string)
  return { ok: true }
}

/** Toggle del `is_done` de un paso. Usado por el checkbox en la UI.
 *  Rechaza el toggle si el paso tiene hijos: su estado se deriva de los hijos. */
export async function toggleStepAction(input: {
  id: string
  is_done: boolean
}): Promise<StepActionResult> {
  const parsed = toggleStepSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás iniciar sesión.' }

  // Si el paso tiene hijos, su is_done es derivado — no permitir cambio manual.
  const { count } = await supabase
    .from('item_steps')
    .select('id', { count: 'exact', head: true })
    .eq('parent_step_id', parsed.data.id)
    .eq('user_id', user.id)
  if ((count ?? 0) > 0) {
    return {
      error: 'Este módulo se completa solo cuando todas sus tareas estén marcadas.',
    }
  }

  return updateStepAction({ id: parsed.data.id, is_done: parsed.data.is_done })
}

/** Reordena pasos en bloque. La suma de pesos no cambia, así que el trigger
 *  no debería protestar. */
export async function reorderStepsAction(input: {
  item_id: string
  order: { id: string; position: number }[]
}): Promise<StepActionResult> {
  const parsed = reorderStepsSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás iniciar sesión.' }

  // Hacemos un update por paso. El trigger es DEFERRABLE INITIALLY DEFERRED,
  // pero como acá no estamos modificando weight_pct, no se viola la suma.
  for (const entry of parsed.data.order) {
    const { error } = await supabase
      .from('item_steps')
      .update({ position: entry.position })
      .eq('id', entry.id)
      .eq('user_id', user.id)
      .eq('item_id', parsed.data.item_id)
    if (error) return { error: mapPgError(error) }
  }

  revalidateItem(parsed.data.item_id)
  return { ok: true }
}

/** Borra un paso. Si era el último, el ítem vuelve al modelo de unidades. */
export async function deleteStepAction(input: { id: string }): Promise<StepActionResult> {
  const parsed = deleteStepSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás iniciar sesión.' }

  const { data: step } = await supabase
    .from('item_steps')
    .select('item_id')
    .eq('id', parsed.data.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!step) return { error: 'No encontramos ese paso.' }

  const { error } = await supabase
    .from('item_steps')
    .delete()
    .eq('id', parsed.data.id)
    .eq('user_id', user.id)
  if (error) return { error: mapPgError(error) }

  revalidateItem(step.item_id as string)
  return { ok: true }
}
