import {
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
} from 'date-fns'
import { es } from 'date-fns/locale'

/**
 * Utilidades de fechas límite.
 *
 * Convención central: un deadline es un **día** (string `YYYY-MM-DD`), no un
 * instante. Toda comparación se hace contra el "hoy" calculado server-side en
 * la timezone del perfil (`todayInTimezone`), que viaja a los clientes como
 * prop — los componentes nunca recalculan "hoy" con el reloj del browser.
 */

export type DeadlineUrgency = 'overdue' | 'today' | 'soon' | 'later'

export type DeadlineEntityType = 'project' | 'item' | 'module' | 'task'

export type DeadlineEntry = {
  entityType: DeadlineEntityType
  id: string
  title: string
  /** Contexto jerárquico: título del ítem (pasos) o primer proyecto (ítems). */
  contextLabel: string | null
  /** YYYY-MM-DD */
  deadline: string
  href: string
  /** 0..1 cuando la entidad tiene progreso medible; null si no aplica. */
  progress: number | null
  urgency: DeadlineUrgency
  /** Días hasta el deadline; negativo si ya venció. */
  daysLeft: number
}

export const ENTITY_TYPE_LABELS: Record<DeadlineEntityType, string> = {
  project: 'Proyecto',
  item: 'Ítem',
  module: 'Módulo',
  task: 'Tarea',
}

/** Fecha calendario (YYYY-MM-DD) de un instante, vista desde la timezone dada.
 *  `en-CA` formatea exactamente como ISO date. Fallback silencioso a UTC. */
export function dateInTimezone(date: Date, tz: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC' }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(date)
  }
}

/** Día actual (YYYY-MM-DD) en la timezone dada. */
export function todayInTimezone(tz: string | null | undefined): string {
  return dateInTimezone(new Date(), tz)
}

/** Días entre hoy y el deadline (negativo si venció). Ambos `YYYY-MM-DD`. */
export function daysLeft(deadline: string, today: string): number {
  return differenceInCalendarDays(parseISO(deadline), parseISO(today))
}

export function getUrgency(deadline: string, today: string): DeadlineUrgency {
  const diff = daysLeft(deadline, today)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff <= 7) return 'soon'
  return 'later'
}

/** Texto humano del estado del deadline, en español argentino. */
export function formatDeadlineLabel(deadline: string, today: string): string {
  const diff = daysLeft(deadline, today)
  if (diff === -1) return 'Venció ayer'
  if (diff < 0) return `Venció hace ${-diff} días`
  if (diff === 0) return 'Vence hoy'
  if (diff === 1) return 'Vence mañana'
  if (diff <= 7) return `Vence en ${diff} días`
  const sameYear = deadline.slice(0, 4) === today.slice(0, 4)
  return format(parseISO(deadline), sameYear ? "d 'de' MMMM" : "d MMM yyyy", { locale: es })
}

// --- Agrupado de la vista Lista -------------------------------------------

export type DeadlineGroupKey =
  | 'overdue'
  | 'today'
  | 'tomorrow'
  | 'this_week'
  | 'this_month'
  | 'later'

export const DEADLINE_GROUP_ORDER: DeadlineGroupKey[] = [
  'overdue',
  'today',
  'tomorrow',
  'this_week',
  'this_month',
  'later',
]

export const DEADLINE_GROUP_LABELS: Record<DeadlineGroupKey, string> = {
  overdue: 'Vencidos',
  today: 'Hoy',
  tomorrow: 'Mañana',
  this_week: 'Esta semana',
  this_month: 'Este mes',
  later: 'Más adelante',
}

/** Grupo de la vista Lista. Semana lunes-domingo, mes calendario. */
export function groupForDeadline(deadline: string, today: string): DeadlineGroupKey {
  const diff = daysLeft(deadline, today)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  const todayDate = parseISO(today)
  const deadlineDate = parseISO(deadline)
  if (deadlineDate <= endOfWeek(todayDate, { weekStartsOn: 1 })) return 'this_week'
  if (deadlineDate <= endOfMonth(todayDate)) return 'this_month'
  return 'later'
}
