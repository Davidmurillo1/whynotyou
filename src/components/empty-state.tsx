import type { ReactNode } from 'react'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-6 py-10 text-center space-y-3">
      <p className="text-text font-medium">{title}</p>
      {description && <p className="text-sm text-muted">{description}</p>}
      {action && <div className="pt-3">{action}</div>}
    </div>
  )
}
