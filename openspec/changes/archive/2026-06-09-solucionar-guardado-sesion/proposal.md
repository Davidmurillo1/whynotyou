## Why

Hoy, cuando una sesión cronometrada es larga (por ejemplo, una sesión de estudio de varias horas sobre un curso con muchos pasos), al apretar **"Guardar sesión"** el botón se queda en estado **"Guardando…"** indefinidamente y la sesión nunca llega a registrarse. El usuario pierde todo el tiempo invertido en ese ítem porque el cronómetro vive solo en memoria del componente: si la pestaña se cierra o se refresca, el `startedAt` y el `elapsed` desaparecen.

El problema combina varias debilidades:

1. **`createSessionAction` hace trabajo costoso después del insert**: `calculateHighlight` ejecuta hasta 5 queries secuenciales (count de ítems done, lookup de streak, max de sesiones del mes, sumas de la semana, count de sesiones del ítem) seguidas de 5 `revalidatePath` — todo dentro del request que el cliente está esperando. Para usuarios con historial denso, la suma puede exceder el timeout de la plataforma serverless y hacer fallar el request entero.
2. **El cliente no tiene timeout ni manejo de errores de runtime**: el `await createSessionAction()` queda colgado para siempre si la server action no responde, y la UI se queda en `submitting = true` sin darle al usuario una salida.
3. **No hay persistencia local del cronómetro**: el `startedAt` (que está en `useState`) y el `elapsed` solo viven en el componente. Si la sesión falla y el usuario cierra la pestaña, **no hay forma de recuperar el tiempo trabajado**.

Necesitamos cortar ese path crítico y blindar la pérdida de trabajo.

## What Changes

- **`createSessionAction` devuelve apenas la sesión está insertada**: el cálculo del `highlight` se mueve a una segunda Server Action (`getSessionHighlightAction`) que el cliente invoca después del éxito, en una request separada que no bloquea el "Guardado". Si el highlight falla o tarda, la sesión ya está persistida.
- **`calculateHighlight` ejecuta sus queries en paralelo** (`Promise.all`) en lugar de en cadena, recortando el tiempo total aunque siga viviendo en una request.
- **El cronómetro persiste a `localStorage` en cada tick**: `startedAt`, `elapsed`, `accumulatedPaused`, `selections`, `note` y `targetUnits` se serializan bajo una clave por `itemId`. Si la pestaña se cierra o falla el guardado, al volver a `/item/[id]/sesion` el `SessionRunner` ofrece **recuperar la sesión pendiente** o descartarla.
- **El cliente envuelve el `await createSessionAction()` en un `AbortController` con timeout de 30s**: si vence, muestra un error específico ("Tardó demasiado. Tu tiempo está guardado, podés reintentar.") y deja `submitting = false` para que el botón vuelva a ser usable.
- **El server action atrapa errores de runtime** y devuelve `{ error: '...' }` en lugar de lanzar, para que el cliente siempre reciba una respuesta interpretable.
- **Al recibir `{ ok: true }`, el cliente borra la entrada de `localStorage`** y procede al `phase === 'done'` como hoy.

## Capabilities

### New Capabilities
<!-- Ninguna capability nueva: el comportamiento de guardado existe, solo lo blindamos. -->

### Modified Capabilities
- `item-steps`: el requirement "Sesiones pueden referenciar un paso" gana escenarios sobre resiliencia ante fallos del guardado (recuperación desde `localStorage`, timeout cliente, error explícito sin perder tiempo). También se ajusta lo que devuelve `createSessionAction` y cómo se calcula el highlight (segunda request).

## Impact

- **`src/lib/actions/sessions.ts`**: `createSessionAction` deja de calcular el `highlight` inline. Se crea `getSessionHighlightAction(sessionId)` como segunda action. Ambas envuelven su cuerpo en try/catch para nunca lanzar.
- **`src/lib/highlights.ts`**: `calculateHighlight` paraleliza sus lookups con `Promise.all` donde son independientes.
- **`src/app/(app)/item/[id]/sesion/session-runner.tsx`**: 
  - Persiste el estado del cronómetro y de la pantalla de captura en `localStorage` bajo `sl:session:<itemId>`.
  - Al montar, si encuentra una entrada válida, ofrece recuperar.
  - `handleSave` envuelve la llamada en `AbortController` con timeout 30s.
  - Tras `{ ok: true }`, borra la entrada y dispara `getSessionHighlightAction` en background (sin esperar) para enriquecer la pantalla `done` cuando responda.
- **No hay cambios de schema en Supabase** ni en el RPC `create_session_with_steps`.
- **No hay cambios en `proxy.ts` ni en políticas RLS**.
- **No introduce dependencias nuevas** — `AbortController`, `localStorage` y `Promise.all` son nativos del runtime.
