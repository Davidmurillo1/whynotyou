import { z } from 'zod'

export const createItemSchema = z.object({
  title: z.string().trim().min(1, 'El título no puede estar vacío').max(200),
  kind: z.enum(['book', 'video_course', 'long_program', 'docs', 'article_series', 'podcast']),
  unit_type: z.enum(['pages', 'videos', 'modules', 'chapters', 'hours', 'percent']),
  total_units: z.coerce.number().positive('Tiene que ser mayor que cero').max(100000),
  source_url: z.string().url('URL inválida').optional().or(z.literal('')),
  category_id: z.string().uuid().optional().or(z.literal('')),
  scope: z.enum(['study', 'work']).default('study'),
})

export type CreateItemInput = z.infer<typeof createItemSchema>

export const createSessionSchema = z.object({
  item_id: z.string().uuid(),
  started_at: z.string(),
  duration_seconds: z.coerce.number().int().min(0).max(86400),
  units_progressed: z.coerce.number().min(0),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
  step_id: z.string().uuid().optional().or(z.literal('')),
  complete_step: z.coerce.boolean().optional(),
})

export type CreateSessionInput = z.infer<typeof createSessionSchema>

/** Edición parcial de los atributos básicos de un ítem desde el detalle. */
export const updateItemFieldsSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, 'El título no puede estar vacío').max(200).optional(),
  kind: z.enum(['book', 'video_course', 'long_program', 'docs', 'article_series', 'podcast']).optional(),
  unit_type: z.enum(['pages', 'videos', 'modules', 'chapters', 'hours', 'percent']).optional(),
  total_units: z.coerce.number().positive('Tiene que ser mayor que cero').max(100000).optional(),
  source_url: z.string().url('URL inválida').optional().or(z.literal('')),
})
export type UpdateItemFieldsInput = z.infer<typeof updateItemFieldsSchema>
