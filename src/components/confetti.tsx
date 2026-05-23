'use client'

import { useEffect } from 'react'

type Tier = 'small' | 'medium' | 'large'

const TIER_CONFIG: Record<Tier, { count: number; spread: number; ticks: number }> = {
  small: { count: 30, spread: 50, ticks: 120 },
  medium: { count: 80, spread: 75, ticks: 200 },
  large: { count: 200, spread: 120, ticks: 300 },
}

export function Confetti({ tier = 'small', trigger }: { tier?: Tier; trigger: unknown }) {
  useEffect(() => {
    if (trigger === undefined || trigger === null || trigger === false) return
    let cancelled = false
    import('canvas-confetti').then((mod) => {
      if (cancelled) return
      const { count, spread, ticks } = TIER_CONFIG[tier]
      mod.default({
        particleCount: count,
        spread,
        ticks,
        origin: { y: 0.6 },
        colors: ['#7c9cff', '#5bd6a4', '#f5a65b', '#e8eaed'],
        disableForReducedMotion: true,
      })
    })
    return () => {
      cancelled = true
    }
  }, [tier, trigger])

  return null
}
