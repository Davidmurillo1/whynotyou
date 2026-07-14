# Tasks: Eficiencia de tiempo (estimado vs. real)

## 1. Base de datos y tokens

- [x] 1.1 Confirmar en Supabase el schema actual de `items`, `item_steps` y `projects` (y si `items` tiene timestamp utilizable como fecha de completado; si no, el desglose de `/stats` usa la fecha de la última sesión del ítem como proxy) — `items.completed_at` existe y se usa directamente
- [x] 1.2 Migración aditiva: `estimated_minutes integer null CHECK (estimated_minutes > 0)` en `items`, `item_steps` y `projects` — migración `add_estimated_minutes_efficiency` aplicada
- [x] 1.3 Agregar token `--color-success` en `src/app/globals.css` (verde legible sobre `bg-surface`, coherente con la paleta dark) — ya existía `--color-success: #5bd6a4`

## 2. Schemas y constantes

- [x] 2.1 Campo opcional `estimated_minutes` (entero 1..100000, mensaje en español) en `createItemSchema` y `updateItemFieldsSchema` de `src/lib/items/schemas.ts`
- [x] 2.2 Mismo campo en los schemas de pasos (`src/lib/items/steps-schemas.ts`: crear y editar paso)
- [x] 2.3 Mismo campo en los schemas de proyectos (`src/lib/projects/schemas.ts`: crear y editar)

## 3. Lógica de eficiencia (`src/lib/efficiency/`)

- [x] 3.1 `compute.ts`: estimación efectiva con cascada tarea → módulo → ítem → proyecto (propia gana; derivada = suma de hijos con estimación; flag `derived` + cobertura "N de M")
- [x] 3.2 `compute.ts`: índice de eficiencia (`tiempo ganado / tiempo real`), estados (`ahead ≥ 1.10`, `on-track 0.90..1.10`, `slow < 0.90`, overlay `exceeded` cuando real > estimado y no completado) y guarda "sin datos" (progreso = 0 o tiempo = 0)
- [x] 3.3 `compute.ts`: atribución de tiempo por paso (reparto igualitario `duration / N` sobre `session_steps`; módulo = directo + tareas hijas) y tiempo ganado por sesión (unidades: `units_progressed / total_units × efectiva`; pasos: contribución al progreso de los `completed_in_session` × efectiva, reutilizando la matemática de `progress.ts`)
- [x] 3.4 Helper de formato para estimaciones en minutos ("2 h 30 m", prefijo `≈` para derivadas) apoyado en `formatDuration` — `src/lib/efficiency/format.ts`

## 4. Server Actions

- [x] 4.1 `src/lib/actions/items.ts`: persistir `estimated_minutes` en create y update (incluye poder quitarla → `null`), filtrando por `user_id`, con `revalidatePath` de `/item/[id]`, `/biblioteca`, `/proyectos` y `/stats`
- [x] 4.2 `src/lib/actions/steps.ts`: persistir `estimated_minutes` por paso en create/update con las mismas garantías
- [x] 4.3 `src/lib/actions/projects.ts`: persistir `estimated_minutes` del proyecto en create/update con las mismas garantías

## 5. Componentes compartidos

- [x] 5.1 `src/components/estimated-time-input.tsx`: campo "Tiempo estimado (opcional)" con inputs de horas y minutos → un solo valor en minutos; variante compacta inline para el editor de pasos; validación de negativos/no numéricos en cliente
- [x] 5.2 `src/components/efficiency-bullet.tsx`: barra bullet CSS/SVG (track = estimado, fill = real, excedente en `danger` pasando el marcador) + chip de estado con etiqueta textual y color por token; tamaños normal (secciones) y mini (filas de desglose)

## 6. Detalle del ítem

- [x] 6.1 Campo de estimación en `src/app/(app)/item/nuevo/item-form.tsx` y en `item-details-editor.tsx` (con control de quitar)
- [x] 6.2 Estimación por paso en `steps-editor.tsx` (versión compacta, módulos y tareas, mostrando la estimación junto al nombre)
- [x] 6.3 Queries en `page.tsx`: sesiones del ítem + `session_steps` (one-shot, agregación en memoria)
- [x] 6.4 Sección "Eficiencia": bullet + índice legible + chip; desglose por módulo con mini barras cuando hay estimaciones de pasos; "Sin datos todavía" sin sesiones; invitación a estimar cuando no hay estimación efectiva — `item-efficiency-section.tsx`

## 7. Detalle del proyecto

- [x] 7.1 Campo de estimación en el formulario de nuevo proyecto y en el editor del detalle (con control de quitar)
- [x] 7.2 Query de sesiones de los ítems miembros (una sola, `item_id in (...)`) y cómputo agregado (solo ítems con estimación efectiva)
- [x] 7.3 Sección "Eficiencia" en `/proyectos/[id]`: bullet agregado + índice + estado, desglose por ítem con mini barra y estado individual, grupo "Sin estimación" para los miembros sin estimación, invitación a estimar cuando no hay datos — `project-efficiency-section.tsx`

## 8. Stats — eficiencia general

- [x] 8.1 Client component selector de rango: presets (7 días, 30 días, 90 días, este año, todo) + dos `<input type="date">` custom, sincronizado con `?desde=&hasta=` vía `router.replace`; default últimos 30 días; rango inválido cae al default — `efficiency-range-picker.tsx`
- [x] 8.2 En `src/app/(app)/stats/page.tsx`: leer `searchParams`, traer sesiones del rango con join a items (+ `estimated_minutes`, `total_units`, `steps_weight_mode`), `session_steps` e `item_steps` involucrados — queries one-shot filtradas por `user_id` — `efficiency-section.tsx`
- [x] 8.3 Cómputo del período: tiempo invertido, tiempo ganado, índice, cobertura sin estimación; bucketing diario en la timezone del perfil
- [x] 8.4 UI de la sección: KPIs (índice + invertido/ganado + cobertura), gráfica Recharts de evolución acumulada (dos series, tooltips en español), desglose de ítems completados en el rango con estimado/real/delta legible, y empty state cuando no hay datos — `efficiency-trend-chart.tsx`
- [x] 8.5 Si se toca `weekly-chart.tsx` o `stats/page.tsx`, aprovechar y resolver sus errores de lint preexistentes (`react-hooks/set-state-in-effect`, `react-hooks/purity`) — `weekly-chart.tsx` migrado a `useSyncExternalStore` (lint pasa de 5 a 2 errores preexistentes)

## 9. Verificación

- [x] 9.1 `npm run lint` — cero errores nuevos (igual o mejor que los 5 preexistentes) — quedaron 2 (profile-form, proxy), ambos en archivos no tocados
- [x] 9.2 `npm run build` — compila sin errores
- [x] 9.3 Prueba manual del flujo completo: estimar ítem/módulo/tarea/proyecto → registrar sesión con pasos → ver eficiencia en detalle de ítem y proyecto → cambiar rangos en `/stats` (presets y custom) → quitar estimación y verificar que todo degrada a las invitaciones/empty states — verificado E2E en preview con usuario de prueba (creado y eliminado al final): estimación propia y derivada (`≈` + cobertura "1 de 2 módulos"), índice y estados correctos (En línea / Más lento / Adelantado / Sin datos todavía), atribución por paso, presets y rango custom con fallback ante rango inválido, desglose "Completados en el período" con delta legible, y CTA al quitar la estimación
