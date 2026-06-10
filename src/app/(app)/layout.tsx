import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  CalendarDays,
  ChartColumn,
  FolderKanban,
  House,
  Library,
  Settings,
  Tags,
} from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { logoutAction } from '@/lib/actions/auth'

const NAV = [
  { href: '/dashboard', label: 'Hoy', icon: House },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays },
  { href: '/biblioteca', label: 'Biblioteca', icon: Library },
  { href: '/proyectos', label: 'Proyectos', icon: FolderKanban },
  { href: '/categorias', label: 'Categorías', icon: Tags },
  { href: '/stats', label: 'Stats', icon: ChartColumn },
  { href: '/ajustes', label: 'Ajustes', icon: Settings },
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
        <div className="grid grid-cols-7">
          {NAV.map((n) => {
            const Icon = n.icon
            return (
              <Link
                key={n.href}
                href={n.href}
                className="flex flex-col items-center gap-1 py-2.5 text-muted hover:text-text transition-colors min-w-0"
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="text-[10px] leading-none tracking-tight truncate max-w-full">
                  {n.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
