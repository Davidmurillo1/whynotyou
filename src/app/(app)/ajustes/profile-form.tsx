'use client'

import { useActionState, useEffect, useState } from 'react'
import { updateProfileAction, type FormState } from '@/lib/actions/profile'

const inputCls =
  'w-full rounded-lg border border-border bg-surface px-3 py-2.5 focus:border-accent focus:outline-none'

export function ProfileForm({
  displayName,
  timezone,
}: {
  displayName: string
  timezone: string
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfileAction, null)
  const [tz, setTz] = useState(timezone)

  useEffect(() => {
    if (!timezone || timezone === 'UTC') {
      try {
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (detected) setTz(detected)
      } catch {}
    }
  }, [timezone])

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="display_name" className="block text-sm text-muted">
          Nombre <span className="text-muted/60">(opcional, lo verás en el dashboard)</span>
        </label>
        <input
          id="display_name"
          name="display_name"
          defaultValue={displayName}
          maxLength={80}
          placeholder="Cómo querés que te salude"
          className={inputCls}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="timezone" className="block text-sm text-muted">Zona horaria</label>
        <input
          id="timezone"
          name="timezone"
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          placeholder="America/Argentina/Buenos_Aires"
          className={inputCls + ' font-mono text-sm'}
        />
        <p className="text-xs text-muted/80">
          Detectada automáticamente. Cambiá si no es la correcta.
        </p>
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm text-success">Guardado.</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2 font-medium text-bg hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}
