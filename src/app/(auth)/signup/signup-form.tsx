'use client'

import { useActionState } from 'react'
import { signupAction, type AuthState } from '@/lib/actions/auth'

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signupAction, null)

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="username" className="block text-sm text-muted">
          Elegí un usuario
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          placeholder="tu_usuario"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-text placeholder:text-muted/60 focus:border-accent focus:outline-none"
        />
        <p className="text-xs text-muted/80">
          Mínimo 3, máximo 24. Solo minúsculas, números y guion bajo.
        </p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm text-muted">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="al menos 8 caracteres"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-text placeholder:text-muted/60 focus:border-accent focus:outline-none"
        />
      </div>

      {state?.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-bg hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {pending ? 'Creando…' : 'Crear cuenta'}
      </button>
    </form>
  )
}
