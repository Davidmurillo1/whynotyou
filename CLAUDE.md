# Why Not You? — Seguimiento de aprendizaje

App personal para registrar y seguir todo lo que estás aprendiendo: libros, cursos en video, formaciones largas, documentación, series de artículos, podcasts. Permite crear ítems con un total de unidades (páginas, videos, módulos, capítulos, horas, %), registrar sesiones cronometradas, ver estadísticas semanales y un heatmap anual, agrupar por categorías y configurar recordatorios.

El idioma del producto es **español argentino** (vos, "querés", etc.). La UI es **dark-only**.

---

## Stack

- **Next.js 16.2.6** con App Router + Turbopack. **Esta versión tiene breaking changes** respecto a versiones anteriores; ver `@AGENTS.md` al final.
- **React 19.2.4** + Server Components + Server Actions.
- **TypeScript 5**.
- **Tailwind v4** (`@tailwindcss/postcss`).
- **Supabase** (`@supabase/ssr` 0.10, `@supabase/supabase-js` 2.106) para auth + base de datos.
- **Zod 4** para validación de input.
- **React Hook Form 7** para forms del cliente.
- **Recharts 3** para gráficos, **Framer Motion 12** para animaciones, **canvas-confetti** para celebraciones, **lucide-react** para iconos, **date-fns 4** para fechas.

---

## Estructura del proyecto

```
src/
├── app/
│   ├── layout.tsx              # Layout raíz: <html lang="es"> dark + fuentes Geist
│   ├── page.tsx                # Redirige a /dashboard (el proxy resuelve login vs dashboard)
│   ├── not-found.tsx           # 404 global (cuando el proxy permite el request)
│   ├── globals.css             # Tokens de color + setup de Tailwind v4
│   ├── (auth)/                 # Grupo público — login y signup
│   │   ├── layout.tsx          # Layout centrado, sin nav
│   │   ├── login/
│   │   └── signup/
│   └── (app)/                  # Grupo autenticado — header + nav + footer móvil
│       ├── layout.tsx          # Valida sesión, si no hay → redirect /login
│       ├── dashboard/          # "Hoy" — saludo, ítems activos, última sesión
│       ├── biblioteca/         # Listado completo de ítems
│       ├── categorias/         # CRUD de categorías
│       ├── item/
│       │   ├── nuevo/          # Crear ítem
│       │   └── [id]/
│       │       ├── page.tsx
│       │       ├── not-found.tsx
│       │       ├── sesion/     # Cronómetro de sesión activa
│       │       └── completado/ # Pantalla post-finalización
│       ├── stats/              # Resumen semanal, heatmap anual, breakdown por categoría
│       └── ajustes/            # Perfil, password, recordatorios
├── components/                 # UI compartida (Button, EmptyState, ProgressRing, Confetti, CategoryBadge)
├── lib/
│   ├── supabase/
│   │   ├── server.ts           # createSupabaseServerClient() — Server Components y Server Actions
│   │   ├── client.ts           # Browser client
│   │   └── proxy.ts            # updateSession() — usado por src/proxy.ts
│   ├── actions/                # Todas las Server Actions ("use server")
│   │   ├── auth.ts             # login, signup, logout
│   │   ├── profile.ts          # update username/timezone, password
│   │   ├── reminders.ts        # configuración de recordatorios
│   │   ├── categories.ts       # CRUD categorías
│   │   ├── items.ts            # CRUD ítems
│   │   └── sessions.ts         # registrar sesión de aprendizaje
│   ├── auth/schemas.ts         # Zod: login/signup
│   ├── items/
│   │   ├── schemas.ts          # Zod: createItem, createSession
│   │   └── constants.ts        # ITEM_KIND_OPTIONS, UNIT_TYPE_OPTIONS, ITEM_STATUS_OPTIONS + labels
│   ├── categories/
│   │   ├── schemas.ts
│   │   └── constants.ts
│   ├── format.ts               # formatDuration, formatTimer, formatRelative, formatDate
│   ├── greetings.ts            # Saludo dinámico según hora + racha + sesión del día
│   └── highlights.ts
└── proxy.ts                    # ⚠️ Antes "middleware.ts" — renombrado en Next 16
```

---

## Decisiones de arquitectura clave

### 1. El "middleware" se llama `proxy` en Next 16

`src/proxy.ts` exporta `proxy()` (no `middleware()`). Si hace falta agregar otro hook a nivel de request, va acá. El `matcher` excluye assets estáticos.

### 2. El proxy gatekeepea la sesión

`src/lib/supabase/proxy.ts → updateSession()`:
- Lee la sesión vía cookies.
- Si **no hay user** y el path **no empieza con un prefijo público** (`PUBLIC_PATHS = ['/login', '/signup']`), redirige a `/login`.
- Si **hay user** y el path es público, redirige a `/dashboard`.

**Implicancia clave**: cualquier feature que pretenda servir contenido a usuarios sin sesión tiene que vivir bajo `/login/...` o `/signup/...`, **o** agregar su prefijo a `PUBLIC_PATHS`. Por ejemplo, el `not-found.tsx` raíz solo se ve para usuarios autenticados o para rutas inexistentes dentro de grupos públicos — ver [openspec/specs/root-not-found-page/spec.md](openspec/specs/root-not-found-page/spec.md).

### 3. `/` siempre redirige a `/dashboard`

`src/app/page.tsx` hace `redirect('/dashboard')` y el proxy decide el destino real. Es la **única fuente de verdad** sobre "a dónde mandar al usuario según su sesión". Cuando necesites un link "volver al inicio", usá `href="/"` para reutilizar esa lógica en lugar de duplicarla.

### 4. Server Actions para todas las mutaciones

Las mutaciones (crear ítem, registrar sesión, login, etc.) viven en `src/lib/actions/*.ts` con `"use server"`. Patrón estándar:
1. Validar con Zod (`safeParse`).
2. Obtener `user` vía `createSupabaseServerClient().auth.getUser()`. Si no hay user, devolver error.
3. Operar en Supabase filtrando por `user_id` (defensa en profundidad además de RLS).
4. `revalidatePath()` de las rutas afectadas.
5. `redirect()` si corresponde.

Cuando agregues actions, **siempre filtrá por `user_id`** en updates/deletes aunque haya RLS — defensa en capas.

### 5. Variables de entorno de Supabase

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

(El proyecto usa la nomenclatura "publishable key" en lugar de "anon key" — respetala al agregar referencias.)

### 6. Server Components mutando cookies

`createSupabaseServerClient()` envuelve `cookieStore.set()` en try/catch silencioso porque **no se puede mutar cookies desde un Server Component** — solo desde Server Actions o Route Handlers. El refresh efectivo de la sesión ocurre en el proxy. No quites ese try/catch.

---

## Convenciones de UI

### Idioma
- Toda la copia visible al usuario va en **español argentino** (vos, "querés", "tenés", "abríla").
- Excepción: nombres técnicos (`Supabase`, `Next.js`, etc.) en su capitalización original.

### Tokens de color (Tailwind, definidos en `globals.css`)
- `bg-bg` — fondo principal
- `bg-surface`, `bg-surface-2` — superficies elevadas
- `text-text` — texto primario
- `text-muted` — texto secundario
- `text-accent` — links y CTAs
- `border-border` — bordes
- `bg-danger` — destructivo

Usá estos tokens — **no hardcodees colores Tailwind crudos** (`text-gray-400`, etc.).

### Componentes base
- [`<Button>`](src/components/button.tsx) con variantes `primary | secondary | ghost | danger`.
- [`<EmptyState>`](src/components/empty-state.tsx) para listas vacías.
- [`<ProgressRing>`](src/components/progress-ring.tsx) para porcentaje de avance.
- [`<CategoryBadge>`](src/components/category-badge.tsx) para mostrar categorías.

### Server Components por defecto
Solo agregá `"use client"` cuando hace falta estado, efectos o handlers del browser. Forms que usan `useFormState` van marcados como client, pero la action sigue siendo server.

### Rutas en español
`/biblioteca`, `/categorias`, `/ajustes`, `/dashboard`, `/stats`, `/item/[id]/sesion`, `/item/[id]/completado`. Si agregás rutas, mantenelas en español.

---

## Modelo de datos (Supabase)

Tablas principales (inferidas del código — confirmá en Supabase antes de cambios de schema):

- `profiles`: `id` (= auth.users.id), `username`, `timezone`, configuración de recordatorios.
- `items`: `id`, `user_id`, `title`, `kind` (book | video_course | long_program | docs | article_series | podcast), `unit_type` (pages | videos | modules | chapters | hours | percent), `total_units`, `source_url`, `category_id`, `status` (active | paused | done | abandoned).
- `sessions`: `id`, `user_id`, `item_id`, `started_at`, `duration_seconds`, `units_progressed`, `note`.
- `categories`: `id`, `user_id`, `name`, color.

Cualquier nueva consulta debe respetar **RLS** (filtrado por `user_id` desde el JWT) y además filtrar explícito en el código.

---

## Lint conocido

`npm run lint` actualmente reporta **5 errores preexistentes** que no son bloqueantes para el funcionamiento pero conviene resolver:

| Archivo | Línea | Regla |
|---------|-------|-------|
| `src/app/(app)/ajustes/profile-form.tsx` | 23 | `react-hooks/set-state-in-effect` |
| `src/app/(app)/dashboard/page.tsx` | 64 | `react-hooks/purity` (Date.now en render) |
| `src/app/(app)/item/[id]/sesion/session-runner.tsx` | 29 | `react-hooks/purity` |
| `src/app/(app)/stats/weekly-chart.tsx` | 10 | `react-hooks/set-state-in-effect` |
| `src/lib/supabase/proxy.ts` | 7 | `prefer-const` |

Si tu cambio toca alguno de esos archivos, aprovechá para arreglarlo. **No introduzcas errores nuevos** — el lint debe quedar igual o mejor.

---

## OpenSpec — flujo de cambios

El proyecto usa **OpenSpec** (esquema `spec-driven`) para documentar features antes de implementarlas. Estructura:

```
openspec/
├── specs/                      # Specs principales (estado actual del producto)
│   └── <capability>/spec.md
└── changes/
    ├── <change-name>/          # Change en progreso
    │   ├── proposal.md         # Por qué
    │   ├── design.md           # Cómo (decisiones + tradeoffs)
    │   ├── specs/              # Delta specs (ADDED/MODIFIED/REMOVED Requirements)
    │   └── tasks.md            # Checklist de implementación
    └── archive/
        └── YYYY-MM-DD-<name>/  # Changes ya implementados y archivados
```

### Slash commands disponibles

| Comando | Qué hace |
|---------|----------|
| `/opsx:propose <name>` | Crea un change completo (proposal + design + specs + tasks) en una pasada |
| `/opsx:new <name>` | Crea un change paso a paso |
| `/opsx:explore` | Modo exploración — pensar sin tocar código |
| `/opsx:continue <name>` | Retomar un change en progreso |
| `/opsx:ff <name>` | Fast-forward (todos los artifacts de una) |
| `/opsx:apply <name>` | Implementar las tasks |
| `/opsx:verify <name>` | Verificar que la implementación matchea los artifacts |
| `/opsx:archive <name>` | Archivar (mueve a `archive/` y syncea specs principales) |

### Reglas para artifacts
- **Specs** usan exactamente **4 `#` para escenarios** (`#### Scenario:`); 3 hashtags rompen el parser silenciosamente.
- **Scenarios** usan `**WHEN**`/`**THEN**`/`**AND**`.
- **Requirements** usan SHALL/MUST (no should/may).
- **Idioma**: el contenido de los artifacts va en español, salvo nombres técnicos.

### Para changes que afectan el comportamiento observable
Crear un delta spec en `changes/<name>/specs/<capability>/spec.md`. Al archivar, el CLI lo sincroniza a `openspec/specs/<capability>/spec.md`.

### Para changes puramente internos (refactors, infra, tooling)
Usar `openspec archive --skip-specs` o no crear delta spec.

---

## Comandos de desarrollo

```powershell
npm run dev     # next dev (Turbopack) — puerto 3000
npm run build   # next build
npm run start   # next start
npm run lint    # eslint
```

El entorno es **Windows + PowerShell**. Si el agente corre comandos shell, usar la sintaxis de PowerShell (`if (...) {...}`, no `&&` para chains condicionales).

---

## Estilo de commits

Los dos commits existentes son cortos y descriptivos en español ("Primer Commit MVP"). Mantenelo conciso, en español, sin convencional commits formales.

---

## Cosas que NO hacer

- ❌ No agregar internacionalización; el producto es solo en español.
- ❌ No agregar un theme switcher; el producto es dark-only.
- ❌ No usar `middleware.ts` — Next 16 lo renombró a `proxy.ts`.
- ❌ No hardcodear colores Tailwind (`bg-gray-800`, etc.) — usá los tokens del proyecto.
- ❌ No agregar tests si no existen ya en la carpeta — el proyecto MVP no tiene suite de tests configurada. Si vas a agregar tests, primero proponé el cambio en un OpenSpec change.
- ❌ No mutar cookies desde Server Components.
- ❌ No saltearte `revalidatePath` después de mutaciones — la UI queda stale.
- ❌ No introducir errores de lint nuevos.

---

@AGENTS.md
