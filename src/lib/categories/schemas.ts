import { z } from 'zod'

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'El nombre no puede estar vacío').max(60),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido')
    .default('#8b93a1'),
  emoji: z.string().trim().max(8).optional().or(z.literal('')),
  parent_id: z.string().uuid().optional().or(z.literal('')),
})

export type CategoryInput = z.infer<typeof categorySchema>
