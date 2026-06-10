import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { es } from 'date-fns/locale'
import type { DeadlineEntry, DeadlineUrgency } from '@/lib/deadlines/utils'
import { DeadlineEntryRow } from './deadline-list'

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

const URGENCY_RANK: Record<DeadlineUrgency, number> = {
  overdue: 0,
  today: 1,
  soon: 2,
  later: 3,
}

const DOT_CLASS: Record<DeadlineUrgency, string> = {
  overdue: 'bg-danger',
  today: 'bg-warning',
  soon: 'bg-warning',
  later: 'bg-muted',
}

/** Vista Calendario: grilla mensual (lunes primero) con indicadores por día y
 *  panel inferior con los deadlines del día seleccionado. Navega meses
 *  client-side sobre el dataset completo, sin refetch. */
export function DeadlineCalendar({
  entries,
  today,
}: {
  entries: DeadlineEntry[]
  today: string
}) {
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(parseISO(today)))
  const [selectedDay, setSelectedDay] = useState(today)

  const byDay = useMemo(() => {
    const map = new Map<string, DeadlineEntry[]>()
    for (const e of entries) {
      const list = map.get(e.deadline) ?? []
      list.push(e)
      map.set(e.deadline, list)
    }
    return map
  }, [entries])

  const days = eachDayOfInterval({
    start: startOfWeek(monthCursor, { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(monthCursor), { weekStartsOn: 1 }),
  })

  const monthLabel = format(monthCursor, 'LLLL yyyy', { locale: es })
  const selectedEntries = byDay.get(selectedDay) ?? []
  const selectedLabel = format(parseISO(selectedDay), "EEEE d 'de' MMMM", { locale: es })

  const goToday = () => {
    setMonthCursor(startOfMonth(parseISO(today)))
    setSelectedDay(today)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium capitalize">{monthLabel}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonthCursor((m) => subMonths(m, 1))}
            aria-label="Mes anterior"
            className="p-2 rounded-lg text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setMonthCursor((m) => addMonths(m, 1))}
            aria-label="Mes siguiente"
            className="p-2 rounded-lg text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-3">
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((d) => (
            <span key={d} className="text-center text-[11px] uppercase tracking-wider text-muted/80 py-1">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const iso = format(day, 'yyyy-MM-dd')
            const dayEntries = byDay.get(iso) ?? []
            const inMonth = isSameMonth(day, monthCursor)
            const isToday = iso === today
            const isSelected = iso === selectedDay
            const topUrgency =
              dayEntries.length > 0
                ? dayEntries.reduce(
                    (top, e) => (URGENCY_RANK[e.urgency] < URGENCY_RANK[top] ? e.urgency : top),
                    dayEntries[0].urgency,
                  )
                : null
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedDay(iso)}
                aria-pressed={isSelected}
                aria-label={`${format(day, "d 'de' MMMM", { locale: es })}${
                  dayEntries.length > 0
                    ? `, ${dayEntries.length} ${dayEntries.length === 1 ? 'vencimiento' : 'vencimientos'}`
                    : ''
                }`}
                className={`relative flex flex-col items-center gap-1 rounded-lg py-2 text-sm tabular transition-colors ${
                  isSelected ? 'bg-accent/15 text-accent' : 'hover:bg-surface-2'
                } ${inMonth ? (isSelected ? '' : 'text-text') : 'text-muted/40'} ${
                  isToday && !isSelected ? 'text-accent' : ''
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full ${
                    isToday ? 'border border-accent' : ''
                  }`}
                >
                  {format(day, 'd')}
                </span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {topUrgency &&
                    dayEntries.slice(0, 3).map((_, i) => (
                      <span
                        key={i}
                        aria-hidden
                        className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[topUrgency]}`}
                      />
                    ))}
                  {dayEntries.length > 3 && (
                    <span className="text-[9px] leading-none text-muted">+{dayEntries.length - 3}</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted capitalize">{selectedLabel}</h2>
        {selectedEntries.length === 0 ? (
          <p className="text-sm text-muted rounded-xl border border-border bg-surface px-4 py-5 text-center">
            Sin vencimientos este día.
          </p>
        ) : (
          <ul className="space-y-2">
            {selectedEntries.map((entry) => (
              <li key={`${entry.entityType}-${entry.id}`}>
                <DeadlineEntryRow entry={entry} today={today} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
