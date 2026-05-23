'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createItemSchema } from '@/lib/items/schemas'

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
  })

  if (error) return { error: 'No pudimos guardar el ítem.' }
  revalidatePath('/dashboard')
  revalidatePath('/biblioteca')
  revalidatePath('/categorias')
  redirect('/dashboard')
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
