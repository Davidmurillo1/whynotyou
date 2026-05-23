'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { passwordSchema } from '@/lib/auth/schemas'
import { z } from 'zod'

const profileSchema = z.object({
  display_name: z.string().trim().max(80).optional().or(z.literal('')),
  timezone: z.string().trim().min(1).max(64),
})

export type FormState = { error?: string; ok?: boolean } | null

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = profileSchema.safeParse({
    display_name: formData.get('display_name'),
    timezone: formData.get('timezone'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás iniciar sesión.' }

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: parsed.data.display_name || null,
      timezone: parsed.data.timezone,
    })
    .eq('id', user.id)

  if (error) return { error: 'No pudimos guardar los cambios.' }
  revalidatePath('/ajustes')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = passwordSchema.safeParse(formData.get('password'))
  if (!parsed.success) return { error: 'Mínimo 8 caracteres.' }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data })
  if (error) return { error: 'No pudimos cambiar la contraseña.' }
  return { ok: true }
}
