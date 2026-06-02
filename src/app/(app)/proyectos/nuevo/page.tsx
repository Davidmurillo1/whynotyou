import Link from 'next/link'
import { ProjectForm } from './project-form'

export const metadata = { title: 'Nuevo proyecto · Why Not You?' }

export default function NuevoProyectoPage() {
  return (
    <div className="space-y-6 max-w-md">
      <header className="space-y-1">
        <p className="text-xs text-muted">
          <Link href="/proyectos" className="hover:text-text transition-colors">
            ← Volver a Proyectos
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo proyecto</h1>
        <p className="text-sm text-muted">
          Una carpeta para agrupar lo que estés haciendo con un objetivo en común.
        </p>
      </header>

      <ProjectForm />
    </div>
  )
}
