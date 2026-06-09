## 1. Dashboard — filtro por progreso real

- [x] 1.1 En `dashboard/page.tsx`, después de fetchear los `item_steps`, filtrar `itemsList` excluyendo ítems con `computeItemProgress(item, steps) >= 1`
- [x] 1.2 Usar el resultado filtrado (`visibleItems`) en lugar de `itemsList` para todo el render (greeting, pick today, agrupado por scope, EmptyState)

## 2. Biblioteca — clasificación de ítems

- [x] 2.1 Importar `computeItemProgress` y `StepLike` en `biblioteca/page.tsx`
- [x] 2.2 Fetchear `item_steps` para todos los ítems listados en una sola query (`.in('item_id', ids)`)
- [x] 2.3 Precomputar el progreso por ítem en un único pase, guardándolo en cada ítem (`ItemWithProgress`)
- [x] 2.4 Definir predicados `isCompleted`, `isAbandonedOnly`, `isFinalized` según las reglas del spec
- [x] 2.5 Dividir los ítems en dos buckets: `currentItems` y `finalizedItems`

## 3. Biblioteca — porcentaje correcto

- [x] 3.1 Reemplazar el cálculo `current_units / total_units` por el progreso precomputado (`computeItemProgress`) en `ItemRow`
- [x] 3.2 Verificar que el porcentaje coincide con el del dashboard para ítems con módulos

## 4. Biblioteca — tabs principales (En curso / Completados)

- [x] 4.1 Agregar parseo de `?view=current|done` en `searchParams`
- [x] 4.2 Crear `buildHref(view, scope)` que genera URLs preservando ambos filtros
- [x] 4.3 Renderizar el componente `ViewTabs` con borde inferior, badge numérico y estado activo (`border-accent`)
- [x] 4.4 Filtrar las sub-secciones según el tab activo (`visibleGroups`)

## 5. Biblioteca — sub-secciones internas

- [x] 5.1 En vista "En curso": sub-secciones `Activo` y `Pausado` (omitir si están vacías)
- [x] 5.2 En vista "Completados": sub-secciones `Completado` y `Abandonado` (omitir si están vacías)
- [x] 5.3 El sub-grupo "Completado" incluye `status = 'done'` y cualquier ítem con `progress >= 1`

## 6. Biblioteca — header y estados vacíos

- [x] 6.1 Mostrar en el subtítulo del header "X ítems en total" (más informativo y simple)
- [x] 6.2 Agregar EmptyState específico cuando la vista activa está vacía pero la biblioteca no
- [x] 6.3 Mantener el EmptyState global cuando la biblioteca entera está vacía

## 7. Verificación y lint

- [x] 7.1 Ejecutar `npm run lint` y confirmar que solo persisten los 5 errores preexistentes
- [x] 7.2 Verificar visualmente: ítems al 100% no aparecen en dashboard
- [x] 7.3 Verificar visualmente: tab "En curso" no muestra ítems al 100%; tab "Completados" los muestra
- [x] 7.4 Verificar visualmente: porcentaje de cada fila es consistente con el dashboard
- [x] 7.5 Verificar: filtros de scope y view se combinan correctamente en la URL
