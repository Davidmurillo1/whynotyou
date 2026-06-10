## ADDED Requirements

### Requirement: Guardado de sesión resiliente ante latencia y fallos

El guardado de una sesión cronometrada SHALL completar el insert de la sesión y, opcionalmente, las asociaciones a pasos, **sin bloquear la respuesta al cliente con cálculos auxiliares**. El `Highlight` motivacional que la pantalla `done` muestra MUST calcularse en una segunda Server Action (`getSessionHighlightAction`) que el cliente invoque después de recibir `{ ok: true }`. La acción principal (`createSessionAction`) MUST devolver una respuesta interpretable (`{ ok: true, itemCompleted, sessionId }` o `{ error: string }`) en todos los casos, incluso ante errores de runtime inesperados (timeouts de DB, fallas del RPC, errores no tipados). Ningún error MUST escaparse sin envolverse en el contrato de retorno.

#### Scenario: Sesión larga con steps se guarda sin colgarse

- **WHEN** el usuario termina una sesión cronometrada de varias horas con 5 o más pasos seleccionados sobre un ítem con decenas de steps cargados
- **THEN** `createSessionAction` ejecuta el insert de la sesión y de `session_steps` y devuelve `{ ok: true, itemCompleted, sessionId }` dentro de un tiempo razonable para el cliente (sin esperar al cálculo del highlight ni a múltiples `revalidatePath` de rutas que el usuario no está visitando ahora)
- **AND** el cliente recibe la respuesta y transita a `phase = 'done'` mostrando "Sesión guardada"
- **AND** la sesión queda persistida con su `duration_seconds` y sus filas en `session_steps`

#### Scenario: Error de runtime en el servidor no cuelga al cliente

- **WHEN** durante la ejecución de `createSessionAction` ocurre un error inesperado (por ejemplo, el RPC falla con un mensaje no contemplado en las ramas conocidas, o la conexión con Supabase tira un timeout)
- **THEN** la action atrapa el error con un `try/catch` envolvente y devuelve `{ error: 'No pudimos guardar la sesión. Tu tiempo está guardado, podés reintentar.' }`
- **AND** el cliente muestra ese error con `setError`, deja `submitting = false` y el botón "Guardar sesión" vuelve a estar habilitado

#### Scenario: Cliente aborta con timeout cuando el servidor tarda demasiado

- **WHEN** la llamada a `createSessionAction` no responde en 30 segundos
- **THEN** el cliente aborta la espera vía `AbortController`
- **AND** muestra el mensaje "Tardó demasiado. Tu tiempo está guardado, podés reintentar." en la zona de error de la pantalla de captura
- **AND** deja `submitting = false` para que el usuario pueda volver a apretar "Guardar sesión"

#### Scenario: Highlight se calcula y muestra sin bloquear el guardado

- **WHEN** el cliente recibe `{ ok: true, sessionId }` de `createSessionAction` y transita a `phase = 'done'`
- **THEN** el cliente invoca `getSessionHighlightAction(sessionId)` en background (sin `await` que bloquee la pantalla)
- **AND** la pantalla `done` aparece de inmediato con el confetti y "Sesión guardada"
- **AND** cuando `getSessionHighlightAction` devuelve un `Highlight` con `text` no vacío, el banner motivacional aparece dentro de la pantalla `done`
- **AND** si `getSessionHighlightAction` falla, demora o devuelve `text === ''`, la pantalla `done` simplemente no muestra el banner y el flujo de navegación posterior no se altera

### Requirement: Persistencia local del cronómetro para no perder trabajo

El estado del cronómetro y la captura de una sesión activa SHALL persistirse en `localStorage` bajo una clave por `itemId` (`sl:session:<itemId>`), incluyendo `startedAt`, `accumulatedPausedMs`, `lastTickAt`, `phase`, `selections`, `note` y `targetUnits`. La entrada MUST escribirse periódicamente mientras la sesión está en curso y MUST borrarse apenas la sesión queda guardada exitosamente. Si al montar el `SessionRunner` existe una entrada válida (con `lastTickAt` dentro de las últimas 24 horas), el componente SHALL ofrecer al usuario **Recuperar** o **Descartar** la sesión pendiente antes de arrancar un cronómetro nuevo.

#### Scenario: Recuperar una sesión interrumpida tras refresh

- **WHEN** el usuario cronometró una sesión por 90 minutos, llegó a la pantalla de captura, apretó "Guardar sesión", el servidor tardó, el cliente abortó por timeout y el usuario refrescó la pestaña
- **AND** el usuario vuelve a `/item/[id]/sesion` del mismo ítem
- **THEN** al montar `SessionRunner` se detecta la entrada en `localStorage` con `lastTickAt` dentro de las últimas 24 horas
- **AND** se muestra un banner con "Hay una sesión sin guardar de hace X minutos. ¿Querés recuperarla?" y dos botones: **Recuperar** y **Descartar**
- **AND** si el usuario elige **Recuperar**, el componente restaura `startedAt`, reconstruye `elapsed` desde `(lastTickAt - startedAt - accumulatedPausedMs) / 1000`, restaura la pantalla `phase` (`capture` si ya estaba ahí), restaura `selections`, `note`, `targetUnits` y el usuario puede volver a apretar "Guardar sesión"
- **AND** si elige **Descartar**, la entrada se borra y arranca un cronómetro nuevo desde cero

#### Scenario: Sesión guardada exitosamente borra el respaldo

- **WHEN** el usuario aprieta "Guardar sesión" y `createSessionAction` devuelve `{ ok: true }`
- **THEN** el cliente borra la entrada `sl:session:<itemId>` de `localStorage` antes de transitar a `phase = 'done'`
- **AND** si el usuario refresca después de ver la pantalla de éxito, no aparece el banner de recuperación

#### Scenario: Entrada vieja (> 24h) se ignora y se borra

- **WHEN** al montar `SessionRunner` existe una entrada `sl:session:<itemId>` con `lastTickAt` de hace más de 24 horas
- **THEN** el componente borra la entrada silenciosamente
- **AND** no muestra el banner de recuperación
- **AND** arranca el cronómetro nuevo como una sesión limpia

#### Scenario: `localStorage` no disponible (modo privado o cuota llena)

- **WHEN** el navegador del usuario tiene `localStorage` deshabilitado o lanza un error al escribir (cuota excedida, modo privado restrictivo)
- **THEN** el componente captura el error con un `try/catch` y continúa sin persistir
- **AND** el flujo de guardado normal (sin recuperación) sigue funcionando idénticamente al comportamiento previo a este cambio
- **AND** no se muestra ningún error al usuario por la persistencia
