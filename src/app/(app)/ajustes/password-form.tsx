'use client'

import { useActionState } from 'react'
import { changePasswordAction, type FormState } from '@/lib/actions/profile'

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, null)
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm text-muted">Nueva contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          placeholder="al menos 8 caracteres"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 focus:border-accent focus:outline-none"
        />
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm text-success">Contraseña actualizada.</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2 font-medium text-bg hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Guardando…' : 'Cambiar contraseña'}
      </button>
    </form>
  )
}
