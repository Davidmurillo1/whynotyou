'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createItemSchema, updateItemFieldsSchema, type UpdateItemFieldsInput } from '@/lib/items/schemas'
import type { ItemScope } from '@/lib/items/constants'

export type ItemActionState = { error?: string } | null

export async function createItemAction(
  _prev: ItemActionState,
  formData: FormData,
): Promise<ItemActionState> {
  const parsed = createItemSchema.safeParse({
    title: formData.get('title'),
    kind: formData.get('kind'),
    unit_type: formData.get('unit_type'),
    total_units: formData.get('total_units'),
    source_url: formData.get('source_url') || '',
    category_id: formData.get('category_id') || '',
    scope: formData.get('scope') || 'study',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás iniciar sesión.' }

  const { error } = await supabase.from('items').insert({
    user_id: user.id,
    title: parsed.data.title,
    kind: parsed.data.kind,
    unit_type: parsed.data.unit_type,
    total_units: parsed.data.total_units,
    source_url: parsed.data.source_url || null,
    category_id: parsed.data.category_id || null,
    scope: parsed.data.scope,
  })

  if (error) return { error: 'No pudimos guardar el ítem.' }
  revalidatePath('/dashboard')
  revalidatePath('/biblioteca')
  revalidatePath('/categorias')
  revalidatePath('/stats')
  redirect('/dashboard')
}

/**
 * Edición parcial de los atributos del ítem desde la página de detalle.
 * Mantiene defensa en profundidad: filtra por `user_id` además de RLS.
 *
 * Si se reduce `total_units` por debajo de `current_units`, el campo
 * `current_units` se ajusta hacia abajo para evitar progresos > 100%.
 */
export async function updateItemFieldsAction(
  input: UpdateItemFieldsInput,
): Promise<{ ok: true } | { error: string }> {
  const parsed = updateItemFieldsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás iniciar sesión.' }

  const patch: Record<string, unknown> = {}
  if (parsed.data.title !== undefined) patch.title = parsed.data.title
  if (parsed.data.kind !== undefined) patch.kind = parsed.data.kind
  if (parsed.data.unit_type !== undefined) patch.unit_type = parsed.data.unit_type
  if (parsed.data.total_units !== undefined) patch.total_units = parsed.data.total_units
  if (parsed.data.source_url !== undefined) {
    patch.source_url = parsed.data.source_url || null
  }

  if (Object.keys(patch).length === 0) return { ok: true }

  // Si bajamos total_units por debajo de current_units, recortamos current_units.
  if (parsed.data.total_units !== undefined) {
    const { data: existing } = await supabase
      .from('items')
      .select('current_units')
      .eq('id', parsed.data.id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (existing && Number(existing.current_units) > parsed.data.total_units) {
      patch.current_units = parsed.data.total_units
    }
  }

  const { error } = await supabase
    .from('items')
    .update(patch)
    .eq('id', parsed.data.id)
    .eq('user_id', user.id)

  if (error) return { error: 'No pudimos guardar los cambios.' }

  revalidatePath('/dashboard')
  revalidatePath('/biblioteca')
  revalidatePath('/stats')
  revalidatePath(`/item/${parsed.data.id}`)
  return { ok: true }
}

export async function updateItemScopeAction(itemId: string, scope: ItemScope) {
  if (scope !== 'study' && scope !== 'work') {
    return { error: 'scope_invalid' as const }
  }
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'no_auth' as const }

  const { error } = await supabase
    .from('items')
    .update({ scope })
    .eq('id', itemId)
    .eq('user_id', user.id)

  if (error) return { error: 'update_failed' as const }
  revalidatePath('/dashboard')
  revalidatePath('/biblioteca')
  revalidatePath('/stats')
  revalidatePath(`/item/${itemId}`)
  return { ok: true as const }
}

export async function updateItemStatusAction(itemId: string, status: 'active' | 'paused' | 'abandoned') {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'no_auth' as const }

  const { error } = await supabase
    .from('items')
    .update({ status })
    .eq('id', itemId)
    .eq('user_id', user.id)

  if (error) return { error: 'update_failed' as const }
  revalidatePath('/dashboard')
  revalidatePath('/biblioteca')
  revalidatePath(`/item/${itemId}`)
  return { ok: true as const }
}

export async function deleteItemAction(itemId: string) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'no_auth' as const }

  const { error } = await supabase.from('items').delete().eq('id', itemId).eq('user_id', user.id)
  if (error) return { error: 'delete_failed' as const }
  revalidatePath('/dashboard')
  revalidatePath('/biblioteca')
  redirect('/biblioteca')
}
