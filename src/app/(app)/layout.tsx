import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { logoutAction } from '@/lib/actions/auth'

const NAV = [
  { href: '/dashboard', label: 'Hoy' },
  { href: '/biblioteca', label: 'Biblioteca' },
  { href: '/categorias', label: 'Categorías' },
  { href: '/stats', label: 'Stats' },
  { href: '/ajustes', label: 'Ajustes' },
]

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen flex flex-col pb-20 md:pb-0">
      <header className="border-b border-border bg-bg/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="font-semibold tracking-tight whitespace-nowrap">
            Why Not You?
          </Link>
          <nav className="hidden md:flex items-center gap-5 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-muted hover:text-text transition-colors">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-4 text-sm text-muted">
            <span className="hidden sm:inline">{profile?.username ?? '…'}</span>
            <form action={logoutAction}>
              <button type="submit" className="hover:text-text transition-colors">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-5 py-8">{children}</main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-border bg-bg/95 backdrop-blur">
        <div className="grid grid-cols-5">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="py-3 text-center text-xs text-muted hover:text-text transition-colors"
            >
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}
