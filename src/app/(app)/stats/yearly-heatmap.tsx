'use client'

type Day = { date: string; minutes: number }

function intensityClass(minutes: number) {
  if (minutes <= 0) return 'bg-surface-2'
  if (minutes < 15) return 'bg-accent/25'
  if (minutes < 30) return 'bg-accent/45'
  if (minutes < 60) return 'bg-accent/65'
  return 'bg-accent'
}

export function YearlyHeatmap({ days, tz }: { days: Day[]; tz: string }) {
  // Construir grid: 53 semanas × 7 días, terminando en hoy.
  const map = new Map(days.map((d) => [d.date, d.minutes]))
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
  // anchor al domingo más reciente (o sábado, depende: usemos lunes = inicio)
  const cells: Day[] = []
  for (let i = 52; i >= 0; i--) {
    for (let dow = 0; dow < 7; dow++) {
      const d = new Date(today)
      const todayDow = (today.getDay() + 6) % 7 // Lun=0
      d.setDate(today.getDate() - todayDow - i * 7 + dow)
      const iso = d.toISOString().slice(0, 10)
      cells.push({ date: iso, minutes: map.get(iso) ?? 0 })
    }
  }

  return (
    <div className="overflow-x-auto">
      <div
        className="grid grid-flow-col gap-[3px]"
        style={{ gridTemplateRows: 'repeat(7, minmax(0, 12px))' }}
      >
        {cells.map((c) => (
          <div
            key={c.date}
            title={`${c.date} · ${Math.round(c.minutes)} min`}
            className={`w-[12px] h-[12px] rounded-[2px] ${intensityClass(c.minutes)}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted mt-3">
        <span>Menos</span>
        <div className="w-[12px] h-[12px] rounded-[2px] bg-surface-2" />
        <div className="w-[12px] h-[12px] rounded-[2px] bg-accent/25" />
        <div className="w-[12px] h-[12px] rounded-[2px] bg-accent/45" />
        <div className="w-[12px] h-[12px] rounded-[2px] bg-accent/65" />
        <div className="w-[12px] h-[12px] rounded-[2px] bg-accent" />
        <span>Más</span>
      </div>
    </div>
  )
}
