import { z } from 'zod'

/** Modo de cálculo del progreso de un módulo (paso con hijos):
 *  - 'weighted': suma ponderada por `weight_pct` de cada tarea (default).
 *  - 'count': igualitario, `done_count / total_count`.
 *  Se ignora para tareas y para módulos sin hijos. */
export const progressModeEnum = z.enum(['weighted', 'count'])
export type ProgressMode = z.infer<typeof progressModeEnum>

/** Modo de reparto del peso entre módulos (pasos raíz) de un ítem:
 *  - 'equal': todos los módulos pesan lo mismo. `weight_pct` se ignora.
 *  - 'custom': cada módulo aporta según su `weight_pct`. La suma no
 *    está obligada a cerrar 100 — el sistema acepta estados intermedios
 *    y solo lo indica visualmente.
 *  Default para ítems nuevos: 'equal'. Default para ítems pre-cambio
 *  con pasos: 'custom' (set por migración). Ver design.md, Decisión 2. */
export const stepsWeightModeEnum = z.enum(['equal', 'custom'])
export type StepsWeightMode = z.infer<typeof stepsWeightModeEnum>

/** Cambio del modo de reparto de peso a nivel ítem. */
export const setStepsWeightModeSchema = z.object({
  item_id: z.string().uuid(),
  mode: stepsWeightModeEnum,
})
export type SetStepsWeightModeInput = z.infer<typeof setStepsWeightModeSchema>

/** Reescalado proporcional a 100 de los pesos de los módulos del ítem. */
export const normalizeStepsWeightsSchema = z.object({
  item_id: z.string().uuid(),
})
export type NormalizeStepsWeightsInput = z.infer<typeof normalizeStepsWeightsSchema>

/** Esquema para crear un paso nuevo. `position` es 0-based y el caller decide
 *  cuál corresponde (la action puede ponerlo al final si no llega).
 *  Si `parent_step_id` llega, el paso es una tarea hija de ese módulo.
 *  La DB garantiza que no se anida más de un nivel (trigger). */
export const createStepSchema = z.object({
  item_id: z.string().uuid(),
  name: z.string().trim().min(1, 'El nombre no puede estar vacío').max(120),
  // Acepta decimales (33.3, 33.33) hasta 2 decimales por compatibilidad con numeric(6,2).
  weight_pct: z.coerce
    .number()
    .gt(0, 'El peso tiene que ser mayor que cero')
    .max(100, 'El peso máximo es 100'),
  position: z.coerce.number().int().min(0).optional(),
  parent_step_id: z.string().uuid().optional(),
  progress_mode: progressModeEnum.optional(),
})
export type CreateStepInput = z.infer<typeof createStepSchema>

/** Edición parcial de un paso. Al menos uno de los campos debe llegar. */
export const updateStepSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  weight_pct: z.coerce.number().gt(0).max(100).optional(),
  position: z.coerce.number().int().min(0).optional(),
  is_done: z.coerce.boolean().optional(),
  progress_mode: progressModeEnum.optional(),
})
export type UpdateStepInput = z.infer<typeof updateStepSchema>

/** Reordenamiento atómico: array de (id, posición). */
export const reorderStepsSchema = z.object({
  item_id: z.string().uuid(),
  order: z
    .array(
      z.object({
        id: z.string().uuid(),
        position: z.coerce.number().int().min(0),
      }),
    )
    .min(1),
})
export type ReorderStepsInput = z.infer<typeof reorderStepsSchema>

export const deleteStepSchema = z.object({
  id: z.string().uuid(),
})
export type DeleteStepInput = z.infer<typeof deleteStepSchema>

export const toggleStepSchema = z.object({
  id: z.string().uuid(),
  is_done: z.coerce.boolean(),
})
export type ToggleStepInput = z.infer<typeof toggleStepSchema>
