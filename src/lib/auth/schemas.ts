import { z } from 'zod'

const RESERVED = new Set([
  'admin', 'root', 'support', 'system', 'null', 'undefined',
  'whynotyou', 'api', 'auth', 'login', 'signup', 'dashboard',
])

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Mínimo 3 caracteres')
  .max(24, 'Máximo 24 caracteres')
  .regex(/^[a-z0-9_]+$/, 'Solo minúsculas, números y guion bajo')
  .refine((u) => !RESERVED.has(u), 'Ese usuario no está disponible')

export const passwordSchema = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .max(128, 'Máximo 128 caracteres')

export const credentialsSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
})

export const SYNTHETIC_DOMAIN = 'whynotyou.local'

export function toSyntheticEmail(username: string) {
  return `${username.toLowerCase()}@${SYNTHETIC_DOMAIN}`
}
