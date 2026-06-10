import { z } from 'zod'
import { isValid, parseISO } from 'date-fns'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Acepta cualquier fecha real (incluso pasada) dentro de un rango de sanidad:
 *  2000-01-01 hasta hoy + 50 años. */
function isValidDeadline(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  if (!isValid(parseISO(value))) return false
  const year = Number(value.slice(0, 4))
  return year >= 2000 && year <= new Date().getFullYear() + 50
}

/** Campo "Fecha límite" para forms: 'YYYY-MM-DD' válido, '' (sin fecha) o ausente.
 *  Las actions persisten `valor || null`. */
export const deadlineField = z
  .string()
  .trim()
  .refine(isValidDeadline, 'La fecha límite no es válida')
  .optional()
  .or(z.literal(''))

/** Variante para updates parciales que aceptan `null` explícito (quitar la fecha). */
export const deadlineFieldNullable = z
  .string()
  .trim()
  .refine(isValidDeadline, 'La fecha límite no es válida')
  .nullable()
  .optional()
  .or(z.literal(''))
