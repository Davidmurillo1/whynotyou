'use client'

import { useSyncExternalStore } from 'react'
import { CalendarDays, ChartNoAxesGantt, List } from 'lucide-react'
import type { DeadlineEntry } from '@/lib/deadlines/utils'
import { DeadlineList } from './deadline-list'
import { DeadlineCalendar } from './deadline-calendar'
import { DeadlineTimeline } from './deadline-timeline'

const STORAGE_KEY = 'wny:agenda:view'

const VIEWS = [
  { value: 'lista', label: 'Lista', icon: List },
  { value: 'calendario', label: 'Calendario', icon: CalendarDays },
  { value: 'timeline', label: 'Línea de tiempo', icon: ChartNoAxesGantt },
] as const

type ViewKey = (typeof VIEWS)[number]['value']

/**
 * Preferencia de vista como store externo mínimo sobre localStorage.
 * `useSyncExternalStore` evita el setState-en-effect y el hydration mismatch:
 * el server snapshot es siempre 'lista' y el cliente se corrige al hidratar.
 * `memoryView` es la fuente de verdad de la sesión; localStorage solo persiste.
 */
let memoryView: ViewKey | null = null
let listeners: Array<() => void> = []

function subscribe(listener: () => void) {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

function readView(): ViewKey {
  if (memoryView) return memoryView
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'lista' || raw === 'calendario' || raw === 'timeline') return raw
  } catch {
    // localStorage no disponible — usamos el default.
  }
  return 'lista'
}

function storeView(view: ViewKey) {
  memoryView = view
  try {
    window.localStorage.setItem(STORAGE_KEY, view)
  } catch {
    // Sin persistencia: la elección vive solo en esta sesión.
  }
  for (const l of listeners) l()
}

export function AgendaViews({
  entries,
  today,
}: {
  entries: DeadlineEntry[]
  today: string
}) {
  const view = useSyncExternalStore(subscribe, readView, () => 'lista' as ViewKey)

  return (
    <div className="space-y-6">
      <div
        role="radiogroup"
        aria-label="Modo de vista de la agenda"
        className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface p-1"
      >
        {VIEWS.map((v) => {
          const active = view === v.value
          const Icon = v.icon
          return (
            <button
              key={v.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={v.label}
              onClick={() => storeView(v.value)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{v.label}</span>
              <span className="sr-only sm:hidden">{v.label}</span>
            </button>
          )
        })}
      </div>

      {view === 'lista' && <DeadlineList entries={entries} today={today} />}
      {view === 'calendario' && <DeadlineCalendar entries={entries} today={today} />}
      {view === 'timeline' && <DeadlineTimeline entries={entries} today={today} />}
    </div>
  )
}
