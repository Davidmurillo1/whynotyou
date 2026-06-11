import { z } from 'zod'
import { PROJECT_DEFAULT_COLOR } from './constants'
import { deadlineField, deadlineFieldNullable } from '@/lib/deadlines/schemas'
import { estimatedMinutesField, estimatedMinutesFieldNullable } from '@/lib/efficiency/schemas'

export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'El nombre no puede estar vacío')
    .max(80, 'El nombre no puede tener más de 80 caracteres'),
  description: z
    .string()
    .trim()
    .max(280, 'La descripción no puede tener más de 280 caracteres')
    .optional()
    .or(z.literal('')),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido')
    .default(PROJECT_DEFAULT_COLOR),
  emoji: z
    .string()
    .trim()
    .max(8, 'El emoji es demasiado largo')
    .optional()
    .or(z.literal('')),
  deadline: deadlineField,
  estimated_minutes: estimatedMinutesField,
})

export const updateProjectSchema = z.object({
  id: z.string().uuid('Proyecto inválido'),
  name: z
    .string()
    .trim()
    .min(1, 'El nombre no puede estar vacío')
    .max(80, 'El nombre no puede tener más de 80 caracteres')
    .optional(),
  description: z
    .string()
    .trim()
    .max(280, 'La descripción no puede tener más de 280 caracteres')
    .nullable()
    .optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido')
    .optional(),
  emoji: z
    .string()
    .trim()
    .max(8, 'El emoji es demasiado largo')
    .nullable()
    .optional(),
  deadline: deadlineFieldNullable,
  estimated_minutes: estimatedMinutesFieldNullable,
})

export const setItemProjectsSchema = z.object({
  item_id: z.string().uuid('Ítem inválido'),
  project_ids: z
    .array(z.string().uuid('Proyecto inválido'))
    .max(20, 'No podés asignar más de 20 proyectos a un ítem'),
})

export const addItemsToProjectSchema = z.object({
  project_id: z.string().uuid('Proyecto inválido'),
  item_ids: z
    .array(z.string().uuid('Ítem inválido'))
    .min(1, 'Tenés que elegir al menos un ítem')
    .max(50, 'No podés agregar más de 50 ítems de una vez'),
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>
export type SetItemProjectsInput = z.infer<typeof setItemProjectsSchema>
export type AddItemsToProjectInput = z.infer<typeof addItemsToProjectSchema>
