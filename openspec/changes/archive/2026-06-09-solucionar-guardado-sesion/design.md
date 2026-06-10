## Context

La server action `createSessionAction` en [src/lib/actions/sessions.ts](../../../src/lib/actions/sessions.ts) hoy hace, en este orden y dentro del mismo request:

1. Validación Zod, `getUser`, lookup del ítem.
2. Insert vía `create_session_with_steps` (RPC atómica con loop por step) o insert directo si no hay pasos.
3. Lookup de `item_steps` para decidir si el ítem está completo.
4. `calculateHighlight` — hasta **5 queries secuenciales** contra `items`, `streaks` y `sessions` (algunas con sort + limit sobre tabla potencialmente grande).
5. **5 `revalidatePath`** consecutivos.
6. Recién entonces devuelve `{ ok: true, ... }`.

El cliente [`SessionRunner`](../../../src/app/(app)/item/[id]/sesion/session-runner.tsx) hace `await createSessionAction(...)` sin timeout ni manejo de errores no devueltos (un throw inesperado deja el `submitting` en true para siempre). El cronómetro (`startedAt`, `elapsed`, `accumulatedPaused`, `selections`, `note`, `targetUnits`) vive solo en `useState`/`useRef` — un refresh o un cierre de pestaña tras un fallo borra todo el tiempo trabajado.

Para usuarios con muchos cursos cargados (caso real reportado: curso de física con S12-S16, decenas de pasos seleccionables, sesión de varias horas), el path crítico de guardado excede los timeouts típicos de la plataforma serverless y el usuario percibe el botón colgado en "Guardando…".

## Goals / Non-Goals

**Goals:**

- Que **`createSessionAction` responda en cuanto la sesión esté insertada en DB**, sin esperar a `calculateHighlight` ni a los `revalidatePath` "decorativos".
- Que el cliente **nunca quede colgado** en "Guardando" — si la server action tarda demasiado o falla, hay un mensaje claro y el botón vuelve a estar habilitado.
- Que **el tiempo cronometrado no se pierda nunca** — si el guardado falla o la pestaña se cierra, el usuario puede reintentar con el `startedAt`, `elapsed` y captura ya construidos.
- Que el **highlight** se siga mostrando en la pantalla de éxito cuando está disponible, sin bloquear la sesión.

**Non-Goals:**

- No tocamos el RPC `create_session_with_steps` ni el schema. La atomicidad del insert sigue siendo la misma.
- No cambiamos políticas RLS ni el modelo de datos.
- No ofrecemos guardado offline real (background sync, service worker). La recuperación es sólo si el usuario vuelve a la página del cronómetro del mismo ítem.
- No persistimos `localStorage` cross-device — es por navegador, asumido.
- No agregamos retry automático; el reintento siempre lo dispara el usuario.

## Decisions

### 1. Dividir `createSessionAction` y mover el highlight a una segunda action

`createSessionAction` devuelve `{ ok: true, itemCompleted, sessionId }` apenas la sesión está insertada y el `itemCompleted` está calculado. Una nueva `getSessionHighlightAction(sessionId)` calcula el `Highlight` y la invoca el cliente desde la pantalla `done` (en paralelo con la animación de confetti).

**Alternativas consideradas:**

- *Dejar todo en una sola action pero paralelizar el highlight con `Promise.all`*: ayuda algo, pero sigue siendo bloqueante y el cliente no recupera nada si esa parte falla.
- *Calcular highlight desde un Route Handler en `app/api/...`*: agrega superficie pública (aunque protegida por la cookie de sesión); usar otra Server Action mantiene la simetría con el resto del código.
- *Calcular highlight desde un Server Component al navegar a `done`*: requeriría que `done` sea su propia ruta (`/item/[id]/completado`), pero hoy es un estado del mismo componente cliente. Mover esa pantalla es un refactor más grande del que necesitamos para el bug.

**Rationale:** Es el cambio mínimo que corta el path crítico. Si `getSessionHighlightAction` falla o tarda, **la sesión ya está guardada** y la pantalla `done` simplemente no muestra el banner de highlight (que igual es opcional — hoy hay un `if (highlight && highlight.text)` antes de renderizarlo).

### 2. Paralelizar las queries dentro de `calculateHighlight`

Las queries de `calculateHighlight` son en su mayoría independientes (count de items done, streak, max sesión del mes, semana, count de sesiones del ítem). Las envolvemos en `Promise.all`. Aunque ahora corre en una request separada, paralelizar de igual forma recorta su latencia y el banner aparece antes en la pantalla `done`.

**Trade-off:** la primera query (`if (ctx.itemCompleted)`) es un early return que paralelizar no respeta. Se mantiene su check antes del `Promise.all`. Los demás corren en paralelo y los `if`s posteriores eligen el primer hit en el orden de prioridad actual.

### 3. Persistir el estado del cronómetro en `localStorage`

Bajo la clave `sl:session:<itemId>` guardamos:

```ts
{
  startedAt: string,
  accumulatedPausedMs: number,
  lastTickAt: number,      // Date.now() del último guardado, para reconstruir elapsed
  phase: 'running' | 'capture',
  selections: Record<string, Selection>,
  note: string,
  targetUnits: string,
}
```

**Por qué `localStorage` y no `sessionStorage` ni IndexedDB:**
- `sessionStorage` se borra al cerrar la pestaña — no resuelve la caída en pleno guardado.
- `IndexedDB` es overkill: un solo objeto pequeño por ítem.
- `localStorage` es síncrono y simple; el tamaño de los datos es pequeño (selecciones hasta 50 steps + nota de 2k caracteres).

**Cuándo escribir:** en cada tick del cronómetro (1× por segundo es aceptable; sólo escribimos cuando la fase cambia o cuando pasaron ≥5s desde el último flush para evitar overhead). En `selections`/`note`/`targetUnits` escribimos en cada cambio (debounced 300ms con `setTimeout`).

**Cuándo borrar:** apenas la server action devuelve `{ ok: true }`. Si la sesión falla, queda viva para recuperar.

**Cuándo ofrecer recuperación:** al montar `SessionRunner`, si existe `sl:session:<itemId>` con `lastTickAt < 24h` se muestra un banner "Hay una sesión sin guardar de hace X. ¿Querés recuperarla?" con dos botones: **Recuperar** (restaura el estado) o **Descartar** (borra la entrada y arranca limpio).

**Trade-off:** si el usuario abrió la sesión en dos pestañas, escriben sobre la misma clave — la última gana. Lo asumimos: el caso de uso normal es una sola pestaña.

### 4. `AbortController` con timeout de 30s en el cliente

```ts
const ctrl = new AbortController()
const timeoutId = setTimeout(() => ctrl.abort(), 30_000)
try {
  const result = await createSessionAction({ ...input }, { signal: ctrl.signal })
  ...
} catch (e) {
  if (e.name === 'AbortError') {
    setError('Tardó demasiado. Tu tiempo está guardado, podés reintentar.')
  } else {
    setError('Hubo un problema. Tu tiempo está guardado, podés reintentar.')
  }
  setSubmitting(false)
} finally {
  clearTimeout(timeoutId)
}
```

**Limitación conocida:** Server Actions de Next.js **no propagan `AbortSignal`** al servidor por contrato — abortar en el cliente no cancela la query en Postgres. El `AbortController` sólo asegura que el **cliente** no queda colgado; el servidor puede seguir ejecutando y eventualmente completar el insert (incluso si el cliente ya mostró error). Es aceptable: el reintento desde `localStorage` sobre un servidor que ya insertó produce, en el peor caso, **dos filas en `sessions` con el mismo `started_at`**. Mitigación: el RPC se mantiene idempotente sobre `(session_id, step_id)` por PK compuesta, así que steps no se duplican. La sesión duplicada es visible y el usuario puede borrarla manualmente desde el detalle (UI existente).

**Por qué 30s y no menos:** queremos cubrir RPC + steps + insert con un buffer holgado para usuarios con conexión lenta. El cómputo del highlight ya no está en este path, así que 30s es muy conservador para el insert puro.

### 5. `try/catch` envolvente en ambas server actions

Ambas funciones envuelven su cuerpo en `try { ... } catch (e) { return { error: 'No pudimos guardar la sesión.' } }`. Hoy, un throw inesperado (timeout de DB, error de red contra Supabase, falla del RPC fuera de los códigos esperados) se propaga como un error genérico al cliente y el cliente lo trata como "exit" silencioso. Con el catch, el cliente siempre recibe un objeto interpretable y muestra el error con `setError`.

**Rationale:** "fail open" hacia el usuario — preferimos un mensaje claro y la posibilidad de reintentar antes que un estado ambiguo.

### 6. `revalidatePath` se mantienen pero quedan después del return

Se llaman antes del `return { ok: true, ... }` (Next.js no permite `revalidatePath` después de `return`). Sin embargo, mover el highlight ya recorta unos cientos de ms del path crítico. Si las mediciones post-cambio muestran que los 5 `revalidatePath` son significativos, **una iteración futura** puede dejarlos sólo para `/dashboard` y `/item/[id]` (las dos rutas a las que se navega) y borrar `revalidatePath('/biblioteca')`, `/stats`, `/categorias` — el `router.refresh()` del cliente ya las cubre cuando el usuario navega ahí. **No lo hacemos en este change** para no mezclar bug fix con optimización.

## Risks / Trade-offs

- **Duplicado por abort del cliente cuando el servidor ya insertó** → Aceptado. El usuario puede borrar la sesión duplicada desde el detalle del ítem. Documentado en la copy del mensaje de error ("Si reintentás y aparecen dos sesiones, podés borrar una").
- **`localStorage` lleno o deshabilitado** → Detectamos `try { localStorage.setItem } catch` y caemos a comportamiento actual (sin persistencia). El bug fix principal (split de la action + timeout cliente) sigue funcionando.
- **`getSessionHighlightAction` falla silenciosa** → El banner del highlight no aparece en `done`. Esperable. No agregamos UI de error para esa parte: el confetti y "Sesión guardada" ya comunican el éxito.
- **Recuperación de sesión muy vieja (semanas)** → Filtramos `lastTickAt < 24h`. Más viejo se ignora y se borra silenciosamente al montar.
- **Migración** → Ninguna. Es un cambio puramente en el cliente y dos server actions. Los usuarios actualizan al recargar la página después del deploy.
- **Lint actual** del archivo `session-runner.tsx` ya tenía un error `react-hooks/purity` (Date.now en render). Mientras tocamos el archivo lo arreglamos (ver tasks.md). No introducimos nuevos.
