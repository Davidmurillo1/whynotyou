import { z } from 'zod'

/** Campo "Tiempo estimado" para forms: minutos enteros (1..100000), '' (sin estimación)
 *  o ausente. Las actions persisten `valor || null`. */
export const estimatedMinutesField = z.coerce
  .number()
  .int('La estimación tiene que ser un número entero de minutos')
  .min(1, 'La estimación tiene que ser de al menos 1 minuto')
  .max(100000, 'La estimación es demasiado grande')
  .optional()
  .or(z.literal(''))

/** Variante para updates parciales que aceptan `null` explícito (quitar la estimación). */
export const estimatedMinutesFieldNullable = z.coerce
  .number()
  .int('La estimación tiene que ser un número entero de minutos')
  .min(1, 'La estimación tiene que ser de al menos 1 minuto')
  .max(100000, 'La estimación es demasiado grande')
  .nullable()
  .optional()
  .or(z.literal(''))
