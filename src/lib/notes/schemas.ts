import { z } from 'zod'

/** Cuerpo de una nota: texto no vacío (tras trim) de hasta 4000 caracteres.
 *  El límite espeja el CHECK `char_length(body) between 1 and 4000` de la DB. */
export const noteBodyField = z
  .string()
  .trim()
  .min(1, 'La nota no puede estar vacía')
  .max(4000, 'La nota es demasiado larga (máximo 4000 caracteres).')

/** Crear una nota. `step_id` ausente/null → nota del ítem ("proyecto en
 *  general"); `step_id` presente → nota de un módulo o una tarea. El `item_id`
 *  del cliente es referencial: la action lo deriva del paso cuando hay `step_id`. */
export const createNoteSchema = z.object({
  item_id: z.string().uuid(),
  step_id: z.string().uuid().nullish(),
  body: noteBodyField,
})
export type CreateNoteInput = z.infer<typeof createNoteSchema>

/** Editar el cuerpo de una nota existente. */
export const updateNoteSchema = z.object({
  id: z.string().uuid(),
  body: noteBodyField,
})
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>

/** Borrar una nota por id. */
export const deleteNoteSchema = z.object({
  id: z.string().uuid(),
})
export type DeleteNoteInput = z.infer<typeof deleteNoteSchema>
