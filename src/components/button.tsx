import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const CLASSES: Record<Variant, string> = {
  primary: 'bg-accent text-bg hover:opacity-90 disabled:opacity-50',
  secondary: 'border border-border bg-surface text-text hover:bg-surface-2 disabled:opacity-50',
  ghost: 'text-muted hover:text-text disabled:opacity-50',
  danger: 'bg-danger text-bg hover:opacity-90 disabled:opacity-50',
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2.5 font-medium transition-opacity ${CLASSES[variant]} ${className ?? ''}`}
    />
  )
}
