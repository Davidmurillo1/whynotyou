type GreetingContext = {
  username: string
  hasSessionToday: boolean
  streakDays: number
  daysSinceLastSession: number | null
  activeItemCount: number
  /** True si el usuario tiene al menos un ítem activo con `scope = 'work'`.
   *  Cuando es true, el copy adopta una voz neutral que no privilegia "estudio". */
  hasWork?: boolean
}

const HOUR_NOW = () => new Date().getHours()

function timeOfDay() {
  const h = HOUR_NOW()
  if (h < 6) return 'late'
  if (h < 12) return 'morning'
  if (h < 19) return 'afternoon'
  return 'evening'
}

export function getGreeting(ctx: GreetingContext): { title: string; subtitle: string } {
  const tod = timeOfDay()
  const titleByTod = {
    morning: `Buen día, ${ctx.username}`,
    afternoon: `Hola, ${ctx.username}`,
    evening: `Buenas, ${ctx.username}`,
    late: `Aún despierto, ${ctx.username}`,
  } as const
  const title = titleByTod[tod]

  const hasWork = Boolean(ctx.hasWork)

  let subtitle: string

  if (ctx.activeItemCount === 0) {
    subtitle = hasWork
      ? 'Acá va a vivir todo lo que tengas entre manos. ¿Con qué arrancamos?'
      : 'Acá va a vivir todo lo que estés aprendiendo. ¿Con qué arrancamos?'
  } else if (ctx.hasSessionToday) {
    subtitle =
      ctx.streakDays >= 7
        ? `${ctx.streakDays} días seguidos. Esto ya es ritmo.`
        : `Sesión registrada hoy. Si querés sumar otra, mejor.`
  } else if (ctx.daysSinceLastSession === null) {
    subtitle = 'Una sola sesión hoy alcanza para empezar.'
  } else if (ctx.daysSinceLastSession <= 1) {
    subtitle = 'Todavía no abriste nada hoy. Veinte minutos cuentan.'
  } else if (ctx.daysSinceLastSession <= 3) {
    subtitle = `Llevás ${ctx.daysSinceLastSession} días sin sesión. Hoy puede ser corto.`
  } else if (ctx.daysSinceLastSession <= 7) {
    subtitle = 'Volviste después de una pausa. Eso cuenta el doble.'
  } else {
    subtitle = hasWork
      ? 'Hace rato que no aparecés. Lo difícil ya es esto: abrir la app.'
      : 'Hace rato que no aparecés. Lo difícil ya es esto: abrir la app.'
  }

  return { title, subtitle }
}
