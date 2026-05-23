import Link from 'next/link'
import { SignupForm } from './signup-form'

export const metadata = { title: 'Crear cuenta · Why Not You?' }

export default function SignupPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Why Not You?</h1>
        <p className="text-muted text-sm">
          Tu cuaderno único para todo lo que estás aprendiendo.
        </p>
      </header>
      <SignupForm />
      <p className="text-sm text-muted text-center">
        ¿Ya tenés cuenta?{' '}
        <Link href="/login" className="text-accent hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  )
}
