import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/empty-state'
import { fetchDeadlineEntries } from '@/lib/deadlines/queries'
import { todayInTimezone } from '@/lib/deadlines/utils'
import { AgendaViews } from './agenda-views'

export const metadata = { title: 'Agenda · Why Not You?' }
export const dynamic = 'force-dynamic'

export default async function AgendaPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user!.id)
    .single()

  const today = todayInTimezone(profile?.timezone)
  const entries = await fetchDeadlineEntries(supabase, user!.id, today)
  const overdueCount = entries.filter((e) => e.urgency === 'overdue').length

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
        <p className="text-sm text-muted mt-1">
          {entries.length === 0 ? (
            'Nada con fecha límite por ahora.'
          ) : (
            <>
              {entries.length} {entries.length === 1 ? 'vencimiento pendiente' : 'vencimientos pendientes'}
              {overdueCount > 0 && (
                <>
                  {' '}· <span className="text-danger">{overdueCount} {overdueCount === 1 ? 'vencido' : 'vencidos'}</span>
                </>
              )}
            </>
          )}
        </p>
      </header>

      {entries.length === 0 ? (
        <EmptyState
          title="No tenés fechas límite pendientes."
          description="Asignale una fecha límite a un ítem, a un paso o a un proyecto y vas a verlo acá: en lista, calendario o línea de tiempo."
          action={
            <Link
              href="/biblioteca"
              className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
            >
              Ir a la biblioteca
            </Link>
          }
        />
      ) : (
        <AgendaViews entries={entries} today={today} />
      )}
    </div>
  )
}
