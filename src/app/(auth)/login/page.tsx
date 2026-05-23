import Link from 'next/link'
import { LoginForm } from './login-form'

export const metadata = { title: 'Entrar · Why Not You?' }

export default function LoginPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Volvé a tu cuaderno</h1>
        <p className="text-muted text-sm">Ingresá con tu usuario y contraseña.</p>
      </header>
      <LoginForm />
      <p className="text-sm text-muted text-center">
        ¿Primera vez por acá?{' '}
        <Link href="/signup" className="text-accent hover:underline">
          Crear cuenta
        </Link>
      </p>
    </div>
  )
}
