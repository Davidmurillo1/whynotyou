import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ProfileForm } from './profile-form'
import { PasswordForm } from './password-form'
import { ReminderForm } from './reminder-form'

export const metadata = { title: 'Ajustes · Why Not You?' }
export const dynamic = 'force-dynamic'

export default async function AjustesPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: profile }, { data: reminder }] = await Promise.all([
    supabase.from('profiles').select('username, display_name, timezone').eq('id', user!.id).single(),
    supabase
      .from('reminders')
      .select('at_time, enabled')
      .eq('user_id', user!.id)
      .limit(1)
      .maybeSingle(),
  ])

  return (
    <div className="space-y-12 max-w-md">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <p className="text-sm text-muted">Lo justo, nada de configuración por configurar.</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xs uppercase tracking-wider text-muted">Perfil</h2>
        <p className="text-xs text-muted">
          Usuario: <span className="text-text">{profile?.username}</span>
        </p>
        <ProfileForm
          displayName={profile?.display_name ?? ''}
          timezone={profile?.timezone ?? 'UTC'}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xs uppercase tracking-wider text-muted">Recordatorio diario por email</h2>
        <ReminderForm
          atTime={reminder?.at_time ? reminder.at_time.slice(0, 5) : '20:00'}
          enabled={reminder?.enabled ?? false}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xs uppercase tracking-wider text-muted">Cambiar contraseña</h2>
        <PasswordForm />
      </section>
    </div>
  )
}
