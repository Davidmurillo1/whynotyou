import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-16 text-center space-y-3">
      <p className="text-4xl">¯\_(ツ)_/¯</p>
      <h1 className="text-xl font-semibold">Esta página no existe.</h1>
      <p className="text-sm text-muted">El enlace puede estar roto, o la ruta cambió.</p>
      <Link href="/" className="inline-block text-accent hover:underline">
        Volver al inicio
      </Link>
    </div>
  )
}
