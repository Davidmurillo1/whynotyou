# Why Not You? — Gestión de tiempo entre estudio y trabajo

App personal para registrar y medir el tiempo invertido en lo que estás aprendiendo y en lo que estás trabajando: libros, cursos, formaciones, documentación, proyectos transversales. Permite crear ítems con un total de unidades (páginas, videos, módulos, capítulos, horas, %) o con pasos jerárquicos (módulos → tareas), agruparlos en categorías y proyectos, registrar sesiones cronometradas con avance por pasos, asignar fechas límite y estimaciones de tiempo, y ver estadísticas semanales, heatmap anual, eficiencia (estimado vs. real) y una agenda de deadlines.

El idioma del producto es **español argentino** (vos, "querés", etc.). La UI es **dark-only**.

---

## Stack

- **Next.js 16.2.6** con App Router + Turbopack. **Esta versión tiene breaking changes** respecto a versiones anteriores; ver `@AGENTS.md` al final.
- **React 19.2.4** + Server Components + Server Actions.
- **TypeScript 5**.
- **Tailwind v4** (`@tailwindcss/postcss`).
- **Supabase** (`@supabase/ssr` 0.10, `@supabase/supabase-js` 2.106) para auth + base de datos + RPCs.
- **Zod 4** para validación de input.
- **React Hook Form 7** para forms del cliente.
- **Recharts 3** para gráficos, **Framer Motion 12** para animaciones, **canvas-confetti** para celebraciones, **lucide-react** para iconos, **date-fns 4** para fechas.

---

## Estructura del proyecto

```
src/
├── app/
│   ├── layout.tsx              # <html lang="es"> dark + fuentes Geist
│   ├── page.tsx                # Redirige a /dashboard (el proxy decide login vs dashboard)
│   ├── not-found.tsx           # 404 global
│   ├── globals.css             # Tokens (incluye --color-warning y --color-success)
│   ├── (auth)/                 # Grupo público — login y signup
│   └── (app)/                  # Grupo autenticado — header + nav (7 entradas) + footer móvil
│       ├── dashboard/          # "Hoy" — saludo, ítems activos, "Vence pronto", última sesión
│       ├── agenda/             # Deadlines: vistas Lista, Calendario, Línea de tiempo
│       ├── biblioteca/         # Tabs En curso/Completados, filtro por scope
│       ├── proyectos/          # Listado, nuevo, detalle con ítems miembros y eficiencia
│       ├── categorias/         # CRUD jerárquico (parent_id)
│       ├── item/
│       │   ├── nuevo/          # Crear ítem (con scope, fecha límite y estimación)
│       │   └── [id]/
│       │       ├── page.tsx    # Detalle: progreso, pasos, eficiencia, deadline, proyectos
│       │       ├── sesion/     # Cronómetro persistido en localStorage + selección N pasos
│       │       └── completado/
│       ├── stats/              # Heatmap anual, semana, eficiencia con rango, por categoría
│       └── ajustes/            # Perfil, password, recordatorios
├── components/                 # UI compartida — Button, EmptyState, ProgressRing, Confetti,
│                               # CategoryBadge, ProjectBadge, ProjectPicker, DeadlineBadge,
│                               # EfficiencyBullet, EstimatedTimeInput
├── lib/
│   ├── supabase/{server,client,proxy}.ts
│   ├── actions/                # Server Actions ("use server")
│   │   ├── auth.ts, profile.ts, reminders.ts, categories.ts
│   │   ├── items.ts, item-weight-mode.ts, steps.ts
│   │   ├── projects.ts, sessions.ts
│   ├── auth/schemas.ts
│   ├── items/                  # schemas, steps-schemas, constants, progress.ts
│   ├── categories/             # schemas, constants
│   ├── projects/               # schemas, constants
│   ├── deadlines/              # schemas, utils (urgencia, agrupado), queries
│   ├── efficiency/             # compute, format, schemas
│   ├── format.ts, greetings.ts, highlights.ts
└── proxy.ts                    # ⚠️ Antes "middleware.ts" — renombrado en Next 16
```

---

## Decisiones de arquitectura clave

### 1. El "middleware" se llama `proxy` en Next 16
`src/proxy.ts` exporta `proxy()` (no `middleware()`). El `matcher` excluye assets estáticos.

### 2. El proxy gatekeepea la sesión
`src/lib/supabase/proxy.ts → updateSession()`:
- Si **no hay user** y el path no empieza con `PUBLIC_PATHS = ['/login', '/signup']`, redirige a `/login`.
- Si **hay user** y el path es público, redirige a `/dashboard`.

Cualquier feature pública tiene que vivir bajo esos prefijos o agregar su prefijo a `PUBLIC_PATHS`.

### 3. `/` siempre redirige a `/dashboard`
`src/app/page.tsx` hace `redirect('/dashboard')` y el proxy decide el destino real. Es la **única fuente de verdad** sobre "a dónde mandar al usuario según su sesión". Para links "volver al inicio", usá `href="/"`.

### 4. Server Actions para todas las mutaciones
Patrón estándar:
1. Validar con Zod (`safeParse`).
2. `createSupabaseServerClient().auth.getUser()`; si no hay user, devolver `{ error }`.
3. Operar en Supabase **filtrando por `user_id`** (defensa en profundidad además de RLS).
4. `revalidatePath()` de las rutas afectadas.
5. `redirect()` si corresponde.

Para flujos atómicos complejos (sesión + asociaciones a pasos + marcar pasos terminados) hay **RPCs en Supabase** (ej. `create_session_with_steps`).

### 5. Server Components mutando cookies
`createSupabaseServerClient()` envuelve `cookieStore.set()` en try/catch silencioso porque no se puede mutar cookies desde un Server Component — solo desde Server Actions o Route Handlers. El refresh efectivo de la sesión ocurre en el proxy. **No quites ese try/catch.**

### 6. Cálculos de timezone server-side
Las clasificaciones de urgencia de deadlines, los rangos de eficiencia y el "hoy" del usuario se calculan en el servidor usando `profile.timezone` y se pasan como prop. El cliente nunca recalcula con su reloj.

### 7. Cronómetro con persistencia local
`SessionRunner` guarda su estado (`startedAt`, `accumulatedPausedMs`, `lastTickAt`, fase, selecciones, nota) en `localStorage` bajo `sl:session:<itemId>`. Si al montar detecta una sesión válida (<24h), ofrece **Recuperar** o **Descartar** antes de arrancar una nueva. La entrada se borra al guardar la sesión exitosamente.

### 8. Variables de entorno
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```
El proyecto usa "publishable key" en lugar de "anon key" — respetalo.

---

## Convenciones de UI

### Idioma
Toda la copia visible va en **español argentino** (voseo, "querés", "tenés", "abríla"). Excepción: nombres técnicos (`Supabase`, `Next.js`, etc.) en su capitalización original.

### Tokens de color (Tailwind, en `globals.css`)
- `bg-bg`, `bg-surface`, `bg-surface-2`, `border-border` — superficies y bordes
- `text-text`, `text-muted`, `text-accent` — tipografía y links
- `bg-success` / `--color-success` — estado "Adelantado" y verde general
- `bg-warning` / `--color-warning` — deadlines próximos y eficiencia "Más lento"
- `bg-danger` / `--color-danger` — destructivo, "Vencido" y "Estimación superada"
- `text-streak` — racha

**No hardcodees colores Tailwind crudos** (`text-gray-400`, `bg-green-500`, etc.).

### Componentes base
`<Button>`, `<EmptyState>`, `<ProgressRing>`, `<CategoryBadge>`, `<ProjectBadge>`, `<ProjectPicker>`, `<DeadlineBadge>`, `<EfficiencyBullet>`, `<EstimatedTimeInput>`. Si necesitás algo nuevo, fijate primero si encaja con uno existente.

### Server Components por defecto
Solo `"use client"` cuando hace falta estado, efectos o handlers del browser.

### Rutas en español
`/dashboard`, `/agenda`, `/biblioteca`, `/proyectos`, `/categorias`, `/stats`, `/ajustes`, `/item/[id]/sesion`, `/item/[id]/completado`. Mantené el patrón si agregás rutas.

### Navegación
7 entradas en el orden: **Hoy · Agenda · Biblioteca · Proyectos · Categorías · Stats · Ajustes**. Mobile usa `grid-cols-7` con ícono `lucide-react` + label corto. No desbordar en viewports de 360px.

---

## Modelo de datos (Supabase)

Confirmá en Supabase antes de cambios de schema. Tablas principales:

- **`profiles`** — `id` (= auth.users.id), `username`, `display_name`, `timezone`, recordatorios.
- **`items`** — `id`, `user_id`, `title`, `kind` (book | video_course | long_program | docs | article_series | podcast), `unit_type` (pages | videos | modules | chapters | hours | percent), `total_units`, `current_units`, `source_url`, `category_id`, `status` (active | paused | done | abandoned), `scope` (study | work), `steps_weight_mode` (equal | custom), `deadline` (date, null), `estimated_minutes` (int, null, >0), `completed_at`.
- **`item_steps`** — `id`, `user_id`, `item_id`, `parent_step_id` (1 solo nivel: módulos raíz, tareas hijas), `name`, `position`, `weight_pct` (numeric(6,2)), `is_done`, `done_at`, `progress_mode` (weighted | count, solo para módulos con tareas), `deadline`, `estimated_minutes`.
- **`categories`** — `id`, `user_id`, `name`, `color`, `emoji`, `parent_id` (jerarquía).
- **`projects`** — `id`, `user_id`, `name`, `description`, `color`, `emoji`, `status` (active | archived), `order_index`, `deadline`, `estimated_minutes`.
- **`project_items`** — join N:M, PK compuesta `(project_id, item_id)` + `user_id` denormalizado. `ON DELETE CASCADE` desde ambos lados.
- **`sessions`** — `id`, `user_id`, `item_id`, `started_at`, `duration_seconds`, `units_progressed`, `note`. La columna legacy `step_id` se preserva pero las escrituras nuevas usan `session_steps`.
- **`session_steps`** — join N:M sesión↔paso, PK `(session_id, step_id)` + `user_id`, `completed_in_session` (bool). Cascade desde sesión y desde paso.
- **`streaks`** — `user_id`, `current`, `longest`, `freezes_available`, `last_active_date`.
- **Vista `daily_minutes`** — por día y usuario: `minutes`, `minutes_study`, `minutes_work` (invariante: `minutes = minutes_study + minutes_work`).

Las migraciones viven en `supabase/migrations/`.

Cualquier nueva consulta debe respetar **RLS** (filtrado por `user_id`) y filtrar explícito en el código. Evitá N+1: las superficies como agenda, biblioteca, dashboard y stats agregan datos con queries one-shot paralelas y cruzan en memoria.

---

## Capabilities OpenSpec activas

Cada capability tiene su spec en `openspec/specs/<name>/spec.md`. Para tareas focalizadas, abrí el spec puntual en lugar de cargar todo en contexto.

| Capability | Propósito | Spec |
|---|---|---|
| `root-not-found-page` | Página 404 raíz con la estética del producto, convive con el proxy. | [spec](openspec/specs/root-not-found-page/spec.md) |
| `item-scope` | Atributo `scope` (study / work) por ítem, filtros, edición de atributos del ítem y copy adaptativo del greeting. | [spec](openspec/specs/item-scope/spec.md) |
| `stats-by-scope` | Stats (totales, gráfico semanal, breakdown por categoría) desglosados entre estudio y trabajo; heatmap queda global. | [spec](openspec/specs/stats-by-scope/spec.md) |
| `item-steps` | Pasos jerárquicos (módulos → tareas, 1 nivel) con peso (`equal` / `custom`), `progress_mode` (`weighted` / `count`), sesiones N:N vía `session_steps`, UI de selección múltiple al cerrar sesión, persistencia local del cronómetro. | [spec](openspec/specs/item-steps/spec.md) |
| `dashboard-items-activos` | Dashboard solo lista ítems "en curso" (status active/paused y progreso < 100%). | [spec](openspec/specs/dashboard-items-activos/spec.md) |
| `biblioteca-completados` | Biblioteca con tabs En curso / Completados (URL `?view=`), sub-secciones por status, progreso consistente con dashboard. | [spec](openspec/specs/biblioteca-completados/spec.md) |
| `projects` | Proyectos N:M sobre ítems, CRUD, listado/detalle, picker desde el detalle del ítem, chip en biblioteca, entrada de nav. | [spec](openspec/specs/projects/spec.md) |
| `deadlines` | Fechas límite opcionales en proyectos/ítems/pasos, página `/agenda` con vistas Lista / Calendario / Línea de tiempo, `<DeadlineBadge>` consistente, módulo "Vence pronto" en dashboard. | [spec](openspec/specs/deadlines/spec.md) |
| `eficiencia-tiempo` | Estimación opcional por entidad, estimación efectiva derivada, índice `T_estimado / T_real` con estados, atribución de tiempo por paso, módulos en detalle ítem/proyecto, sección en `/stats` con rango de fechas. | [spec](openspec/specs/eficiencia-tiempo/spec.md) *(tras archivar el change actual)* |

Changes en progreso viven bajo `openspec/changes/<name>/`; archivados bajo `openspec/changes/archive/YYYY-MM-DD-<name>/`.

---

## OpenSpec — flujo de cambios

```
openspec/
├── specs/<capability>/spec.md           # Estado actual del producto
└── changes/
    ├── <change-name>/                   # Change en progreso
    │   ├── proposal.md (por qué)
    │   ├── design.md (cómo: decisiones + tradeoffs)
    │   ├── specs/ (delta: ADDED / MODIFIED / REMOVED Requirements)
    │   └── tasks.md (checklist)
    └── archive/YYYY-MM-DD-<name>/
```

### Slash commands
| Comando | Qué hace |
|---|---|
| `/opsx:propose <name>` | Change completo en una pasada (proposal + design + specs + tasks) |
| `/opsx:new <name>` | Change paso a paso |
| `/opsx:explore` | Modo exploración — pensar sin tocar código |
| `/opsx:continue <name>` | Retomar un change en progreso |
| `/opsx:ff <name>` | Fast-forward (todos los artifacts de una) |
| `/opsx:apply <name>` | Implementar las tasks |
| `/opsx:verify <name>` | Verificar implementación vs. artifacts |
| `/opsx:archive <name>` | Archivar (mueve a `archive/` y syncea specs principales) |

### Reglas para artifacts
- **Specs**: exactamente **4 `#` para escenarios** (`#### Scenario:`); 3 hashtags rompen el parser silenciosamente.
- **Scenarios**: `**WHEN**` / `**THEN**` / `**AND**`.
- **Requirements**: SHALL / MUST (no should/may).
- **Idioma**: español argentino, salvo nombres técnicos.

Changes que afectan comportamiento observable → delta spec en `changes/<name>/specs/<capability>/spec.md`. Changes puramente internos (refactor, infra, tooling) → `openspec archive --skip-specs` o sin delta spec.

---

## Lint conocido

`npm run lint` actualmente reporta **2 errores preexistentes** (verificado el 2026-06-19):

| Archivo | Línea | Regla |
|---|---|---|
| `src/app/(app)/ajustes/profile-form.tsx` | 23 | `react-hooks/set-state-in-effect` |
| `src/lib/supabase/proxy.ts` | 7 | `prefer-const` |

Si tu cambio toca esos archivos, aprovechá para arreglarlo. **No introduzcas errores nuevos** — el lint debe quedar igual o mejor.

---

## Comandos de desarrollo

```powershell
npm run dev     # next dev (Turbopack) — puerto 3000
npm run build   # next build
npm run start   # next start
npm run lint    # eslint
```

Entorno: **Windows + PowerShell**. Para chains condicionales usá `if (...) {...}`, no `&&`.

---

## Estilo de commits

Cortos y descriptivos en español (ej. "Eficiencia de Tiempo Implementada", "Funcionalidad Deadlines Añadida"). Sin convencional commits formales.

---

## Cosas que NO hacer

- ❌ No agregar internacionalización; el producto es solo en español.
- ❌ No agregar un theme switcher; el producto es dark-only.
- ❌ No usar `middleware.ts` — Next 16 lo renombró a `proxy.ts`.
- ❌ No hardcodear colores Tailwind (`bg-gray-800`, `text-green-500`, etc.) — usá los tokens del proyecto.
- ❌ No agregar tests si no existen ya en la carpeta — el MVP no tiene suite de tests. Si vas a agregar, primero proponé un OpenSpec change.
- ❌ No mutar cookies desde Server Components.
- ❌ No saltearte `revalidatePath` después de mutaciones — la UI queda stale.
- ❌ No introducir errores de lint nuevos.
- ❌ No recalcular "hoy" en el cliente — para urgencias y rangos usá la timezone del perfil server-side.
- ❌ No escribir en `sessions.step_id` desde código nuevo — usá `session_steps` (ver capability `item-steps`).

---

@AGENTS.md
