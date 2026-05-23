'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { credentialsSchema, toSyntheticEmail } from '@/lib/auth/schemas'

export type AuthState = { error?: string } | null

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }
  const { username, password } = parsed.data
  const supabase = await createSupabaseServerClient()

  const { data: available, error: rpcErr } = await supabase.rpc('is_username_available', {
    p_username: username,
  })
  if (rpcErr) return { error: 'Algo falló de nuestro lado. Probá de nuevo.' }
  if (!available) return { error: 'Ese usuario ya está tomado.' }

  const { error } = await supabase.auth.signUp({
    email: toSyntheticEmail(username),
    password,
    options: { data: { username } },
  })
  if (error) {
    return { error: 'No pudimos crear la cuenta. Probá de nuevo.' }
  }
  redirect('/dashboard')
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: 'Usuario o contraseña no coinciden.' }
  }
  const { username, password } = parsed.data
  const supabase = await createSupabaseServerClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: toSyntheticEmail(username),
    password,
  })
  if (error) return { error: 'Usuario o contraseña no coinciden.' }
  redirect('/dashboard')
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
