## 1. Base de datos (Supabase)

- [x] 1.1 Crear migración con `create table public.projects` (id, user_id, name, description, color, emoji, status, order_index, created_at, updated_at) y check constraints (`name` 1..80, `status` in `active|archived`)
- [x] 1.2 Agregar índice `projects_user_idx` sobre `(user_id, status, order_index)`
- [x] 1.3 Crear migración con `create table public.project_items` (project_id, item_id, user_id, added_at) con PK compuesta `(project_id, item_id)` y FKs con `on delete cascade`
- [x] 1.4 Agregar índices `project_items_user_idx (user_id)` y `project_items_item_idx (item_id)`
- [x] 1.5 Habilitar RLS en `projects` y `project_items`
- [x] 1.6 Crear policies `select/insert/update/delete` para `projects` exigiendo `user_id = auth.uid()`
- [x] 1.7 Crear policies `select/insert/delete` para `project_items` exigiendo `user_id = auth.uid()`
- [x] 1.8 Crear trigger `BEFORE INSERT` en `project_items` que valide ownership cruzado de `project_id` e `item_id`
- [x] 1.9 Verificar que aplicando la migración a una base con datos existentes (ítems y categorías) no rompe nada y RLS queda activa

## 2. Schemas y constantes

- [x] 2.1 Crear `src/lib/projects/constants.ts` con `PROJECT_STATUS_OPTIONS`, type `ProjectStatus`, `projectStatusLabel(s)`, `PROJECT_DEFAULT_COLOR`
- [x] 2.2 Crear `src/lib/projects/schemas.ts` con `createProjectSchema`, `updateProjectSchema`, `setItemProjectsSchema`, `addItemsToProjectSchema`
- [x] 2.3 Asegurar que todos los mensajes de error de Zod están en español argentino

## 3. Server Actions

- [x] 3.1 Crear `src/lib/actions/projects.ts` con `"use server"` y helper `paths()` que revalida `/proyectos`, `/biblioteca`, `/dashboard`
- [x] 3.2 Implementar `createProjectAction(_prev, formData)` con validación Zod, `getUser`, insert filtrando por `user_id`, redirect a `/proyectos/[id]`
- [x] 3.3 Implementar `updateProjectAction(id, patch)` con filtrado por `user_id`
- [x] 3.4 Implementar `deleteProjectAction(id)` con filtrado por `user_id` y redirect a `/proyectos`
- [x] 3.5 Implementar `setProjectStatusAction(id, status)` filtrando por `user_id`
- [x] 3.6 Implementar `addItemsToProjectAction(projectId, itemIds[])` con `insert ... on conflict do nothing` y validación cruzada de ownership
- [x] 3.7 Implementar `removeItemFromProjectAction(projectId, itemId)` con `delete` filtrando por `user_id`
- [x] 3.8 Implementar `setItemProjectsAction(itemId, projectIds[])` con diff: borra los que ya no están y agrega los nuevos, todo filtrando por `user_id` y revalidando `/item/[id]`

## 4. Componentes UI compartidos

- [x] 4.1 Crear `src/components/project-badge.tsx` con props `name`, `color`, `emoji`, `size?: 'sm' | 'md'`, análogo a `<CategoryBadge>`
- [x] 4.2 Crear `src/components/project-picker.tsx` (client component) con multi-select de proyectos del usuario, búsqueda por nombre y callback `onChange(projectIds[])`
- [x] 4.3 Reutilizar `<Button>`, `<EmptyState>`, `<ProgressRing>` existentes en las nuevas vistas

## 5. Rutas — listado y creación

- [x] 5.1 Crear `src/app/(app)/proyectos/page.tsx` (Server Component) que liste proyectos del usuario agrupados por `status`, mostrando conteo de ítems y `<ProgressRing>` por proyecto
- [x] 5.2 Agregar empty state cuando el usuario no tiene proyectos
- [x] 5.3 Crear `src/app/(app)/proyectos/nuevo/page.tsx` con formulario (`useFormState`) y `createProjectAction`
- [x] 5.4 Diseñar el formulario con campos: name, description opcional, color picker (mismos colores que categorías), emoji opcional

## 6. Rutas — detalle del proyecto

- [x] 6.1 Crear `src/app/(app)/proyectos/[id]/page.tsx` con query de proyecto + ítems miembros vía join con `project_items`
- [x] 6.2 Validar acceso (filtrar por `user_id`) y renderizar `not-found` si no existe
- [x] 6.3 Crear `src/app/(app)/proyectos/[id]/not-found.tsx` análogo al de items
- [x] 6.4 Renderizar encabezado con `<ProjectBadge>` size `md`, nombre y emoji
- [x] 6.5 Renderizar bloque de progreso agregado con `<ProgressRing>` size `lg` calculando `sum(current_units) / sum(total_units)` y manejando división por cero
- [x] 6.6 Renderizar lista de ítems con `<ProgressRing>` size `sm`, scope chip, `<CategoryBadge>` (si tiene), `unit_type` y porcentaje
- [x] 6.7 Agregar acción "Agregar ítems" que abre un picker de ítems del usuario y dispara `addItemsToProjectAction`
- [x] 6.8 Agregar acción "Quitar" por ítem (icono X) que dispara `removeItemFromProjectAction`
- [x] 6.9 Agregar acción "Editar" (form inline con `updateProjectAction`)
- [x] 6.10 Agregar acción "Archivar / Desarchivar" con `setProjectStatusAction`
- [x] 6.11 Agregar acción "Eliminar" con confirmación que aclara "no se borrarán los ítems" y dispara `deleteProjectAction`

## 7. Navegación principal

- [x] 7.1 Agregar `{ href: '/proyectos', label: 'Proyectos' }` al array `NAV` en `src/app/(app)/layout.tsx` entre Biblioteca y Categorías
- [x] 7.2 Cambiar `grid-cols-5` por `grid-cols-6` en la nav inferior móvil
- [x] 7.3 Verificar responsive: header desktop, nav móvil y wrap del texto

## 8. Integración en detalle de ítem

- [x] 8.1 En `src/app/(app)/item/[id]/page.tsx` cargar los proyectos a los que pertenece el ítem (query a `project_items` + `projects`)
- [x] 8.2 Renderizar sección "Proyectos" con chips `<ProjectBadge>` o CTA "Agregar a un proyecto" si vacío
- [x] 8.3 Botón "Gestionar" abre `<ProjectPicker>` precargado con los proyectos actuales del ítem
- [x] 8.4 Confirmación del picker dispara `setItemProjectsAction(itemId, projectIds[])`

## 9. Integración en biblioteca

- [x] 9.1 En `src/app/(app)/biblioteca/page.tsx` agregar query única a `project_items` por `user_id` que devuelva `(item_id, project_id)` y `projects` mínimo `(id, name, color, emoji, order_index)`
- [x] 9.2 Construir un map `itemId -> projects[]` ordenado por `order_index` y limitar a primer chip + sufijo `+N`
- [x] 9.3 Renderizar `<ProjectBadge>` size `sm` al lado del `<CategoryBadge>` existente
- [x] 9.4 Confirmar que la query adicional no introduce N+1 ni rompe el orden actual del listado

## 10. Verificación y pulido

- [x] 10.1 Probar end-to-end: crear proyecto, agregar ítems, ver progreso, quitar ítem, archivar, desarchivar, eliminar
- [x] 10.2 Probar que un ítem en dos proyectos se ve en ambos y que quitarlo de uno no lo saca del otro
- [x] 10.3 Probar combinación study+work en el mismo proyecto
- [x] 10.4 Probar acceso cross-tenant: que un proyecto ajeno devuelva `not-found` y que las server actions rechacen `project_id` / `item_id` ajenos
- [x] 10.5 Verificar copy en español argentino en todas las vistas, errores y mensajes
- [x] 10.6 Verificar que `npm run lint` no introduce errores nuevos
- [x] 10.7 Verificar dark-only y tokens (sin `bg-gray-*`, `text-gray-*`, etc.)
- [x] 10.8 Validar el change con `openspec validate add-proyectos --strict`
