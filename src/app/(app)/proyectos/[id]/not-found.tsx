import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="text-center space-y-3 py-16">
      <p className="text-4xl">¯\_(ツ)_/¯</p>
      <h1 className="text-xl font-semibold">No encontramos ese proyecto.</h1>
      <p className="text-sm text-muted">Quizás lo eliminaste, o el enlace está roto.</p>
      <Link href="/proyectos" className="inline-block text-accent hover:underline">
        Volver a Proyectos
      </Link>
    </div>
  )
}
