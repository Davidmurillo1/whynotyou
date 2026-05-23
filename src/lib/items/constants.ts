export const ITEM_KIND_OPTIONS = [
  { value: 'book', label: 'Libro' },
  { value: 'video_course', label: 'Curso en video' },
  { value: 'long_program', label: 'Formación larga' },
  { value: 'docs', label: 'Documentación' },
  { value: 'article_series', label: 'Serie de artículos' },
  { value: 'podcast', label: 'Podcast' },
] as const

export const UNIT_TYPE_OPTIONS = [
  { value: 'pages', label: 'Páginas', singular: 'página' },
  { value: 'videos', label: 'Videos', singular: 'video' },
  { value: 'modules', label: 'Módulos', singular: 'módulo' },
  { value: 'chapters', label: 'Capítulos', singular: 'capítulo' },
  { value: 'hours', label: 'Horas', singular: 'hora' },
  { value: 'percent', label: 'Porcentaje', singular: '%' },
] as const

export const ITEM_STATUS_OPTIONS = [
  { value: 'active', label: 'En curso' },
  { value: 'paused', label: 'En pausa' },
  { value: 'done', label: 'Terminado' },
  { value: 'abandoned', label: 'Abandonado' },
] as const

export type ItemKind = (typeof ITEM_KIND_OPTIONS)[number]['value']
export type UnitType = (typeof UNIT_TYPE_OPTIONS)[number]['value']
export type ItemStatus = (typeof ITEM_STATUS_OPTIONS)[number]['value']

export function kindLabel(kind: ItemKind | string) {
  return ITEM_KIND_OPTIONS.find((k) => k.value === kind)?.label ?? kind
}
export function unitLabel(unit: UnitType | string, count: number = 2) {
  const found = UNIT_TYPE_OPTIONS.find((u) => u.value === unit)
  if (!found) return unit
  return count === 1 ? found.singular : found.label.toLowerCase()
}
export function statusLabel(status: ItemStatus | string) {
  return ITEM_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status
}
