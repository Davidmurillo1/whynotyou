type Props = {
  name: string
  color: string
  emoji?: string | null
  size?: 'sm' | 'md'
}

export function CategoryBadge({ name, color, emoji, size = 'sm' }: Props) {
  const cls =
    size === 'sm'
      ? 'text-xs px-2 py-0.5 gap-1'
      : 'text-sm px-2.5 py-1 gap-1.5'
  return (
    <span
      className={`inline-flex items-center rounded-full border ${cls}`}
      style={{
        borderColor: `${color}55`,
        color: color,
        background: `${color}12`,
      }}
    >
      {emoji && <span aria-hidden>{emoji}</span>}
      <span className="font-medium">{name}</span>
    </span>
  )
}
