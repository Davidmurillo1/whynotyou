## Context

La app usa el App Router de Next.js 16. Hoy solo existe un `not-found.tsx` específico para `/item/[id]`. Cualquier otra ruta desconocida cae en el 404 por defecto de Next.js, que no respeta el modo oscuro, las fuentes Geist ni el idioma español que usa el resto del producto.

El layout raíz (`src/app/layout.tsx`) ya define `lang="es"`, modo oscuro, fuentes Geist y los tokens de color (`bg-bg`, `text-text`, `text-muted`, etc.). Una página `src/app/not-found.tsx` hereda automáticamente ese layout.

## Goals / Non-Goals

**Goals:**
- Que las rutas desconocidas que **no son interceptadas por el proxy** muestren una página 404 coherente con el branding.
- Mantener consistencia visual con el `not-found.tsx` de ítem (mismo emoticón, mismo tono, misma estructura).
- No requerir lógica de sesión propia: el archivo es estático y hereda solo el layout raíz.

**Non-Goals:**
- No se agrega telemetría de rutas inexistentes (puede venir después si hace falta).
- No se modifica el `not-found.tsx` existente del ítem.
- No se cambian las rutas existentes ni el comportamiento del proxy.
- No se hace internacionalización: el texto queda solo en español, como el resto de la app.

## Decisions

### Decisión 1: Ubicación en `src/app/not-found.tsx`

Next.js App Router resuelve `not-found.tsx` jerárquicamente. Colocarlo en `src/app/` lo convierte en el fallback global para cualquier ruta que no tenga un `not-found.tsx` más específico.

**Alternativas consideradas:**
- Colocarlo dentro del grupo `(app)/`: lo descartamos porque entonces solo aplicaría a rutas autenticadas y heredaría el header de la app, lo cual es raro para una página 404 a la que cualquiera puede llegar.

### Decisión 2: Enlace de retorno apunta a `/`

La raíz `/` ya redirige a `/dashboard` ([src/app/page.tsx:5](src/app/page.tsx:5)), y el proxy de autenticación decide si el destino real es `/dashboard` o `/login`. Apuntar a `/` desde el 404 reutiliza esa lógica sin duplicarla.

**Alternativas consideradas:**
- Detectar la sesión en el `not-found.tsx` con `createSupabaseServerClient` y linkear directamente a `/dashboard` o `/login`. Lo descartamos: agrega una llamada a Supabase para un caso trivial cuando el redirect ya está resuelto en `/`.

### Decisión 3: Componente Server, sin estado ni interactividad

La página es estática: no necesita `"use client"`, ni hooks, ni server actions. Render directo de JSX.

### Decisión 4: Mantener la voz del `not-found.tsx` de ítem

El existente usa `¯\_(ツ)_/¯` + h1 + descripción + Link. Replicamos ese patrón para que ambas páginas se sientan parte del mismo producto. Texto adaptado al caso general (no específico de ítem).

## Risks / Trade-offs

- **Riesgo**: Si en el futuro alguien agrega un `not-found.tsx` más específico (por ejemplo en `(app)/`), el comportamiento cambia para usuarios autenticados sin que este cambio se entere.
  - **Mitigación**: Documentar en el spec que este 404 es el fallback global; los `not-found.tsx` específicos son override esperados.

- **Trade-off**: El enlace pasa por `/` → redirect → destino real, en lugar de ir directo. Es un round-trip extra, pero a cambio queda una sola fuente de verdad sobre dónde mandar al usuario según su sesión.

- **Limitación conocida**: El proxy de Supabase ([src/lib/supabase/proxy.ts:31-35](src/lib/supabase/proxy.ts:31-35)) redirige toda ruta no pública sin sesión a `/login` antes de que Next.js resuelva el 404. Por lo tanto, un usuario no autenticado escribiendo una URL inventada nunca verá esta página: verá el login. El 404 raíz aplica a usuarios autenticados y a rutas inexistentes dentro de los prefijos públicos (`/login/...`, `/signup/...`). Si en algún momento se quisiera mostrar el 404 también a no autenticados, habría que listar la ruta de 404 como pública explícitamente en el proxy, lo cual está fuera del alcance de este cambio.

## Migration Plan

No aplica: solo se agrega un archivo nuevo. No hay datos, ni rutas existentes, ni dependencias afectadas. Si más adelante hace falta revertir, alcanza con borrar `src/app/not-found.tsx` y se vuelve al 404 por defecto.
