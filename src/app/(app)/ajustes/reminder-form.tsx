'use client'

import { useActionState } from 'react'
import { upsertReminderAction, type ReminderState } from '@/lib/actions/reminders'

export function ReminderForm({ atTime, enabled }: { atTime: string; enabled: boolean }) {
  const [state, action, pending] = useActionState<ReminderState, FormData>(upsertReminderAction, null)

  return (
    <form action={action} className="space-y-4">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={enabled}
          className="h-4 w-4 accent-accent"
        />
        <span className="text-sm">Quiero que me avisen por email para no perder ritmo.</span>
      </label>

      <div className="space-y-1.5">
        <label htmlFor="at_time" className="block text-sm text-muted">A qué hora</label>
        <input
          id="at_time"
          name="at_time"
          type="time"
          defaultValue={atTime}
          required
          className="rounded-lg border border-border bg-surface px-3 py-2.5 focus:border-accent focus:outline-none tabular"
        />
        <p className="text-xs text-muted/80">
          Tomamos tu zona horaria de los ajustes de perfil.
        </p>
      </div>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm text-success">Listo.</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2 font-medium text-bg hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Guardando…' : 'Guardar recordatorio'}
      </button>
    </form>
  )
}
