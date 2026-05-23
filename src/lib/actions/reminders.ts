'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const reminderSchema = z.object({
  at_time: z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida'),
  enabled: z.boolean(),
})

export type ReminderState = { error?: string; ok?: boolean } | null

export async function upsertReminderAction(
  _prev: ReminderState,
  formData: FormData,
): Promise<ReminderState> {
  const parsed = reminderSchema.safeParse({
    at_time: formData.get('at_time'),
    enabled: formData.get('enabled') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás iniciar sesión.' }

  const { data: existing } = await supabase
    .from('reminders')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('reminders')
      .update({
        at_time: `${parsed.data.at_time}:00`,
        enabled: parsed.data.enabled,
        channel: 'email',
      })
      .eq('id', existing.id)
    if (error) return { error: 'No pudimos guardar el recordatorio.' }
  } else {
    const { error } = await supabase.from('reminders').insert({
      user_id: user.id,
      at_time: `${parsed.data.at_time}:00`,
      enabled: parsed.data.enabled,
      channel: 'email',
    })
    if (error) return { error: 'No pudimos guardar el recordatorio.' }
  }

  revalidatePath('/ajustes')
  return { ok: true }
}
