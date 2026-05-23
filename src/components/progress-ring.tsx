'use client'

import { motion } from 'framer-motion'

type Props = {
  value: number // 0..1
  size?: number
  stroke?: number
  showLabel?: boolean
  className?: string
}

export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  showLabel = true,
  className,
}: Props) {
  const safe = Math.max(0, Math.min(1, value))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - safe)
  const pct = Math.round(safe * 100)

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-surface-2)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={pct >= 100 ? 'var(--color-success)' : 'var(--color-accent)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </svg>
      {showLabel && (
        <span className="absolute inset-0 flex items-center justify-center tabular text-xs font-medium">
          {pct}%
        </span>
      )}
    </div>
  )
}
