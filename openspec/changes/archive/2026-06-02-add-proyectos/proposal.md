## Why

Hoy los ítems se agrupan por una sola dimensión (categoría) y por scope (`study` / `work`), pero no existe una forma de juntar **ítems heterogéneos que pertenecen a un mismo objetivo** — por ejemplo, "Prepararme para entrevista de backend" puede mezclar un libro (estudio), un curso en video (estudio) y una documentación de la API de la empresa (trabajo), cada uno con categorías distintas.

Los proyectos resuelven esto como una **carpeta liviana** que cruza categorías y scopes: permiten ver, en un solo lugar, el avance combinado de todo lo que un objetivo concreto involucra, sin obligar al usuario a re-etiquetar nada.

## What Changes

- Nueva sección **Proyectos** en la navegación (entre Biblioteca y Categorías), accesible en `/proyectos`.
- CRUD de proyectos: crear, renombrar, cambiar color/emoji, archivar y eliminar.
- Cada proyecto agrupa **N ítems** vía una relación N:M (`project_items`); un ítem puede estar en varios proyectos al mismo tiempo, sin importar su `scope` ni su `category_id`.
- Página de detalle `/proyectos/[id]` con:
  - Progreso combinado del proyecto (promedio ponderado por `total_units`).
  - Listado de ítems del proyecto con barra de progreso individual, chip de scope y badge de categoría.
  - Acciones rápidas: agregar ítems al proyecto, quitar ítems, abrir cualquier ítem.
- Desde el detalle del ítem (`/item/[id]`): chips de los proyectos a los que pertenece, con shortcut para agregar/quitar.
- En la biblioteca: chip opcional de "proyecto" al lado del badge de categoría cuando el ítem pertenece a uno o más proyectos.
- Estética alineada con el resto de la app: dark-only, tokens existentes (`bg-surface`, `text-accent`, etc.), `<ProgressRing>`, `<EmptyState>`, `<Button>` y badges similares a `<CategoryBadge>`.

No es BREAKING: ítems y categorías siguen funcionando exactamente igual; los proyectos son una capa adicional opcional.

## Capabilities

### New Capabilities
- `projects`: Agrupación libre de ítems en "carpetas" (proyectos) que cruzan `scope` y `category_id` para representar objetivos del usuario que combinan estudio y trabajo.

### Modified Capabilities
<!-- Ninguna. `item-scope` y `item-steps` quedan intactas: proyectos vive como capability propia y solo se referencia desde la UI compartida. -->

## Impact

- **Base de datos (Supabase)**: nueva tabla `projects` y nueva tabla join `project_items` con RLS por `user_id`. Sin cambios a `items` ni a `categories`.
- **Server Actions**: nuevo archivo `src/lib/actions/projects.ts` con CRUD de proyectos y mutaciones de pertenencia (`addItemToProject`, `removeItemFromProject`).
- **Rutas**: nuevas páginas `src/app/(app)/proyectos/page.tsx`, `src/app/(app)/proyectos/nuevo/page.tsx`, `src/app/(app)/proyectos/[id]/page.tsx`. Nueva entrada en `NAV` del layout autenticado.
- **UI**: nuevo componente `<ProjectBadge>` análogo a `<CategoryBadge>`; nuevo widget para asignar ítems a proyectos (multi-select).
- **Validación**: nuevos schemas Zod en `src/lib/projects/schemas.ts` y constantes en `src/lib/projects/constants.ts`.
- **Detalle de ítem**: agregar sección "Proyectos" con chips y acción de gestionar pertenencia.
- **Biblioteca / dashboard**: cambios mínimos (chip extra cuando aplica). No se modifica el filtro por scope ni la agrupación por estado.
