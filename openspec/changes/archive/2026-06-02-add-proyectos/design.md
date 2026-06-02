## Context

La app ya tiene dos formas de organizar ítems:
1. **Categorías** (`items.category_id`) — relación 1:N, jerarquía de un nivel, pensada para temas/áreas estables ("Backend", "Diseño UX").
2. **Scope** (`items.scope`) — clasificación binaria `study` / `work` que separa "lo que aprendés" de "lo que hacés".

Ambas son atributos del ítem y excluyentes en su dominio. No cubren el caso en que **un mismo objetivo concreto del usuario combina ítems de distintos temas y/o scopes** — por ejemplo "Lanzar el side-project" puede tocar un libro de marketing (estudio · marketing), un curso de SEO (estudio · marketing), y la doc interna del side-project (trabajo · dev).

Los proyectos vienen a llenar ese vacío como una **capa transversal**: una colección con N ítems, donde el ítem puede pertenecer a más de un proyecto y los proyectos son independientes de categoría y scope.

## Goals / Non-Goals

**Goals:**
- Permitir crear proyectos como agrupaciones libres de ítems sin restricciones por `scope` ni `category_id`.
- Relación **N:M** entre proyectos e ítems: un ítem puede estar en varios proyectos a la vez.
- CRUD completo desde una sección dedicada `/proyectos` con UI moderna y minimalista alineada al dark-only existente.
- Progreso agregado del proyecto calculado a partir del progreso de cada ítem miembro.
- Defensa en profundidad estándar del proyecto: RLS en Supabase **+** filtrado por `user_id` en cada server action.
- Estética coherente: tokens (`bg-surface`, `text-accent`, etc.), componentes ya existentes (`<ProgressRing>`, `<EmptyState>`, `<Button>`), iconografía `lucide-react`.

**Non-Goals:**
- Pasos/steps por proyecto (los pasos siguen siendo del ítem, ver `openspec/specs/item-steps/spec.md`).
- Sesiones cronometradas a nivel de proyecto — las sesiones siguen siendo del ítem.
- Compartir proyectos entre usuarios o colaboración multiusuario.
- Jerarquía/anidamiento de proyectos. Un proyecto es plano (sin sub-proyectos) en esta iteración.
- Stats por proyecto en `/stats` (puede ser una capability futura; aquí solo mostramos progreso en el detalle).
- Recordatorios o notificaciones a nivel de proyecto.
- Tocar `categories` o el atributo `scope` de los ítems.

## Decisions

### 1. Tabla nueva `projects` (no reusar `categories`)

**Decisión:** crear una tabla `projects` independiente.

**Alternativa considerada:** marcar ciertas categorías como "proyecto" con un flag. Rechazada porque:
- Categorías son **1:N** y este caso requiere **N:M**. Hackear esa relación rompería la semántica actual y obligaría a migrar UI existente.
- Categorías hoy tienen `parent_id` con jerarquía de 1 nivel; mezclar proyectos ahí complica los queries de la página `/categorias`.
- Conceptualmente categorías son atributos descriptivos del ítem; proyectos son agrupaciones operativas con vida propia (archivar, completar).

Schema propuesto:

```sql
create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  description   text,
  color         text not null default '#8b93a1',
  emoji         text,
  status        text not null default 'active' check (status in ('active','archived')),
  order_index   integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index projects_user_idx on public.projects(user_id, status, order_index);
```

### 2. Tabla join `project_items` (N:M sin payload)

**Decisión:** tabla join mínima con `(project_id, item_id)` como PK compuesta.

```sql
create table public.project_items (
  project_id uuid not null references public.projects(id) on delete cascade,
  item_id    uuid not null references public.items(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (project_id, item_id)
);

create index project_items_user_idx on public.project_items(user_id);
create index project_items_item_idx on public.project_items(item_id);
```

`user_id` se denormaliza en la tabla join para simplificar la RLS y los filtros (`.eq('user_id', user.id)` directo, sin joins).

**Por qué PK compuesta** sin `id` propio: la pertenencia es idempotente — agregar el mismo ítem dos veces a un proyecto debe ser un no-op natural. La PK compuesta lo asegura a nivel de base.

### 3. RLS y políticas

Mismas políticas que `categories` e `items`: `select`, `insert`, `update`, `delete` permitidos solo cuando `user_id = auth.uid()`. La tabla join replica `user_id` para que las políticas no necesiten joins a `projects` o `items`.

Triggers `BEFORE INSERT` en `project_items` validan que `project_id.user_id = item_id.user_id = auth.uid()` (defensa en profundidad ante intentos de cross-tenant). Si Supabase ya rechaza vía RLS, el trigger queda como segunda capa pero **no se omite**.

### 4. Progreso del proyecto

**Decisión:** calcular el progreso del proyecto como **promedio ponderado por `total_units`** de cada ítem miembro:

```
project_pct = sum(current_units) / sum(total_units)
```

**Alternativas consideradas:**
- *Promedio simple de porcentajes*: rechazado porque distorsiona cuando los ítems tienen tamaños muy distintos (un PDF de 4 páginas pesa igual que un curso de 80 videos).
- *Progreso ponderado por sesiones recientes*: rechazado por complejidad; no aporta al objetivo de "ver cuán cerca está el objetivo".

El cálculo se hace **on the fly** en el server component del detalle (Supabase query con `items` filtrados por membresía). No se cachea ni se denormaliza.

### 5. Server Actions

Nuevo archivo `src/lib/actions/projects.ts` con `"use server"`. Sigue el patrón ya establecido:

```ts
createProjectAction(_prev, formData)        // form con useFormState
updateProjectAction(id, patch)              // edición inline
deleteProjectAction(id)                     // confirmación destructiva
setProjectStatusAction(id, 'active'|'archived')
addItemsToProjectAction(projectId, itemIds: string[])
removeItemFromProjectAction(projectId, itemId)
setItemProjectsAction(itemId, projectIds: string[])   // reemplaza el set de proyectos del ítem
```

Cada action: valida con Zod → `supabase.auth.getUser()` → opera con `.eq('user_id', user.id)` → `revalidatePath()` de rutas afectadas (`/proyectos`, `/proyectos/[id]`, `/biblioteca`, `/dashboard`, `/item/[id]`).

`setItemProjectsAction` se implementa como **upsert + delete diff** en una sola transacción lógica (dos queries: `delete` de los proyectos que ya no están, `insert ... on conflict do nothing` de los nuevos).

### 6. Rutas y navegación

- `/proyectos` — listado de proyectos del usuario, agrupados por `status` (`active`, `archived`). Botón "+ Nuevo".
- `/proyectos/nuevo` — formulario de creación.
- `/proyectos/[id]` — detalle: progreso agregado, lista de ítems miembros con `<ProgressRing>`, acciones (agregar/quitar ítems, archivar, eliminar).
- `/proyectos/[id]/not-found.tsx` — análogo a `/item/[id]/not-found.tsx`.

Se agrega `{ href: '/proyectos', label: 'Proyectos' }` al array `NAV` de `src/app/(app)/layout.tsx`. Con esto la nav inferior móvil pasa de 5 a 6 ítems — ajustar `grid-cols-5` a `grid-cols-6` en la nav móvil.

### 7. Componentes UI

- **`<ProjectBadge>`** (`src/components/project-badge.tsx`): análogo a `<CategoryBadge>` — emoji opcional + color (border-left o dot) + nombre. Tamaños `sm | md`.
- **`<ProjectPicker>`** (`src/components/project-picker.tsx`): multi-select de proyectos para agregar ítems o asignar ítems a proyectos. Modal liviano con búsqueda por nombre.
- **`<ProjectProgress>`** (in-page, no shared): bloque grande en el detalle con `<ProgressRing>` tamaño `lg`, conteo "X de Y ítems completados" y porcentaje.

Estética minimalista: layouts con `space-y-*`, bordes `border-border`, hover `hover:bg-surface-2`, transiciones `transition-colors`. **Sin animaciones gratuitas**; confetti solo si el proyecto pasa a 100% (consistencia con la pantalla `completado` del ítem — decisión opcional, marcada en Open Questions).

### 8. Detalle del ítem — sección "Proyectos"

En `/item/[id]/page.tsx` se agrega una sección bajo el bloque actual con los proyectos a los que pertenece el ítem (chips). Botón "Gestionar proyectos" abre `<ProjectPicker>` y dispara `setItemProjectsAction`. Si el ítem no está en ningún proyecto, se muestra un CTA mínimo "Agregar a un proyecto".

### 9. Biblioteca — visibilidad de proyectos

En `/biblioteca`, cuando un ítem pertenece a uno o más proyectos, se muestra **un chip** del primer proyecto (o "+N" si pertenece a más). Click en el chip → `/proyectos/[id]`. Para evitar regresiones de rendimiento, la query carga `project_items` en bulk por `user_id` y se hace map en memoria (igual que el `catMap` actual).

### 10. Constantes y schemas

`src/lib/projects/constants.ts`:

```ts
export const PROJECT_STATUS_OPTIONS = ['active', 'archived'] as const
export type ProjectStatus = (typeof PROJECT_STATUS_OPTIONS)[number]
export function projectStatusLabel(s: ProjectStatus): string { ... }
export const PROJECT_DEFAULT_COLOR = '#8b93a1'
```

`src/lib/projects/schemas.ts`:

```ts
export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Nombre requerido').max(80, 'Máximo 80 caracteres'),
  description: z.string().trim().max(280).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(PROJECT_DEFAULT_COLOR),
  emoji: z.string().max(8).optional(),
})

export const updateProjectSchema = createProjectSchema.partial().extend({
  id: z.string().uuid(),
})

export const setItemProjectsSchema = z.object({
  item_id: z.string().uuid(),
  project_ids: z.array(z.string().uuid()).max(20),
})
```

Límite de 20 proyectos por ítem es defensivo (no es un límite duro de producto; se puede subir).

## Risks / Trade-offs

- **[Costo N+1 en listado de biblioteca]** → Mitigación: una sola query adicional a `project_items` por `user_id` y join en memoria, igual al patrón actual de categorías.
- **[Proliferación de chips en biblioteca / dashboard]** → Mitigación: solo se muestra el primero más "+N"; el detalle completo vive en `/item/[id]`.
- **[Eliminar un proyecto con ítems dentro]** → Mitigación: `on delete cascade` en `project_items` borra solo las pertenencias, **nunca** los ítems. El UI confirma explícitamente "Esto no borrará los ítems, solo la agrupación".
- **[Cálculo de progreso engañoso con ítems en estado `paused` o `abandoned`]** → Mitigación: el progreso del proyecto incluye **todos** los ítems miembros (consistencia con cómo se ve el progreso del ítem en su detalle). En el listado se muestra adicionalmente "X activos de Y" para que el usuario contextualice.
- **[Nav móvil llena con 6 ítems]** → Mitigación: ajustar a `grid-cols-6` y revisar el tamaño de texto. Si queda apretado, considerar mover "Ajustes" a un overflow en una iteración futura (fuera de scope acá).
- **[Re-render masivo al cambiar pertenencia desde el picker]** → Mitigación: `setItemProjectsAction` revalida solo `/proyectos`, `/proyectos/[id]` de los afectados y `/item/[id]`, no toda la app.

## Migration Plan

1. **Migración Supabase** (vía `apply_migration` MCP o `supabase/migrations/`):
   - `create table projects ...`
   - `create table project_items ...`
   - Índices.
   - Políticas RLS para ambas tablas.
   - Trigger `BEFORE INSERT` en `project_items` validando ownership de `project_id` e `item_id`.
2. **Código**:
   - Crear `src/lib/projects/{schemas,constants}.ts`.
   - Crear `src/lib/actions/projects.ts`.
   - Crear componentes UI (`<ProjectBadge>`, `<ProjectPicker>`).
   - Crear rutas `/proyectos`, `/proyectos/nuevo`, `/proyectos/[id]`.
   - Integrar chip en `/biblioteca` y sección en `/item/[id]`.
   - Agregar entrada en `NAV`.
3. **Rollback**: drop de las dos tablas nuevas + revert de los archivos de código. No hay cambios destructivos en tablas existentes; rollback es seguro.

## Open Questions

- ¿Mostrar confetti cuando el proyecto llega a 100%? (Coherente con `completado` del ítem, pero podría sentirse excesivo si el usuario completa varios el mismo día.) — **Propuesta:** sí, pero con throttle por sesión de navegación.
- ¿Reordenamiento drag-and-drop de proyectos en `/proyectos`, o alcanza con `order_index` editable? — **Propuesta:** para esta iteración solo `order_index` controlado por orden de creación; drag-and-drop puede ser change posterior.
- ¿El detalle del proyecto muestra también pasos (`item_steps`) de los ítems? — **Propuesta:** no en esta iteración; el detalle del proyecto se queda en nivel ítem, los pasos siguen en `/item/[id]`.
