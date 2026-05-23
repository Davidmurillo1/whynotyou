'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { categorySchema } from '@/lib/categories/schemas'

export type CategoryState = { error?: string; ok?: boolean } | null

function paths() {
  revalidatePath('/categorias')
  revalidatePath('/biblioteca')
  revalidatePath('/dashboard')
  revalidatePath('/stats')
}

export async function createCategoryAction(
  _prev: CategoryState,
  formData: FormData,
): Promise<CategoryState> {
  const parsed = categorySchema.safeParse({
    name: formData.get('name'),
    color: formData.get('color') || '#8b93a1',
    emoji: formData.get('emoji') || '',
    parent_id: formData.get('parent_id') || '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás iniciar sesión.' }

  const { error } = await supabase.from('categories').insert({
    user_id: user.id,
    name: parsed.data.name,
    color: parsed.data.color,
    emoji: parsed.data.emoji || null,
    parent_id: parsed.data.parent_id || null,
  })
  if (error) {
    if (error.message.includes('max_depth')) {
      return { error: 'Las categorías solo se anidan un nivel.' }
    }
    return { error: 'No pudimos guardar la categoría.' }
  }
  paths()
  return { ok: true }
}

export async function updateCategoryAction(
  id: string,
  patch: { name?: string; color?: string; emoji?: string | null; parent_id?: string | null },
) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'no_auth' as const }

  const { error } = await supabase
    .from('categories')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return { error: 'update_failed' as const }
  paths()
  return { ok: true as const }
}

export async function deleteCategoryAction(id: string) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'no_auth' as const }

  const { error } = await supabase.from('categories').delete().eq('id', id).eq('user_id', user.id)
  if (error) return { error: 'delete_failed' as const }
  paths()
  redirect('/categorias')
}

export async function setItemCategoryAction(itemId: string, categoryId: string | null) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'no_auth' as const }

  const { error } = await supabase
    .from('items')
    .update({ category_id: categoryId })
    .eq('id', itemId)
    .eq('user_id', user.id)
  if (error) return { error: 'update_failed' as const }
  paths()
  revalidatePath(`/item/${itemId}`)
  return { ok: true as const }
}
