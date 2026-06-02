export const PROJECT_STATUS_OPTIONS = [
  { value: 'active', label: 'Activo' },
  { value: 'archived', label: 'Archivado' },
] as const

export type ProjectStatus = (typeof PROJECT_STATUS_OPTIONS)[number]['value']

export function projectStatusLabel(status: ProjectStatus | string) {
  return PROJECT_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status
}

export const PROJECT_DEFAULT_COLOR = '#8b93a1'

export const PROJECT_COLORS = [
  { hex: '#7c9cff', name: 'Azul' },
  { hex: '#5bd6a4', name: 'Verde' },
  { hex: '#f5a65b', name: 'Naranja' },
  { hex: '#e36f6f', name: 'Coral' },
  { hex: '#c084fc', name: 'Violeta' },
  { hex: '#38bdf8', name: 'Cyan' },
  { hex: '#facc15', name: 'Amarillo' },
  { hex: '#fb7185', name: 'Rosa' },
  { hex: '#8b93a1', name: 'Gris' },
] as const

export const PROJECT_SUGGESTED_EMOJIS = [
  '🎯', '🚀', '📦', '🧩', '💡', '🛠️', '🏗️', '🔭',
  '📌', '🌟', '🧪', '🗂️', '🎬', '🎨',
] as const
