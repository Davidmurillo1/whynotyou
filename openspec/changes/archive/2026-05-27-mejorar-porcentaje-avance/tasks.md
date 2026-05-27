## 1. Migración de base de datos

- [x] 1.1 Crear `supabase/migrations/<fecha>_items_steps_weight_mode.sql` con `ALTER TABLE items ADD COLUMN steps_weight_mode text NOT NULL DEFAULT 'equal' CHECK (steps_weight_mode IN ('equal','custom'))`.
- [x] 1.2 En la misma migración, ejecutar `UPDATE items SET steps_weight_mode = 'custom' WHERE id IN (SELECT DISTINCT item_id FROM item_steps)` para preservar la lectura de ítems con pasos preexistentes.
- [ ] 1.3 Aplicar la migración en local y verificar que ítems pre-cambio quedan en `'custom'` y los pos-cambio en `'equal'`. _(Manual — corré la migración en tu instancia de Supabase.)_

## 2. Schemas Zod y tipos

- [x] 2.1 Agregar `stepsWeightModeEnum = z.enum(['equal','custom'])` y `type StepsWeightMode` (extendido `src/lib/items/steps-schemas.ts`).
- [x] 2.2 Crear schema `setStepsWeightModeSchema` con `{ item_id: uuid, mode: stepsWeightModeEnum }`. También se agregó `normalizeStepsWeightsSchema`.
- [x] 2.3 Tipos: el campo se agregó manualmente a `Item` (dashboard) y `ItemForShell` (detalle); también a `ItemProgressInput`. No hay generator de tipos configurado en el proyecto.
- [x] 2.4 No hace falta tocar `createItemSchema` — el form de creación no expone módulos. El DB default (`'equal'`) se ocupa.

## 3. Lógica de progreso (`src/lib/items/progress.ts`)

- [x] 3.1 Extender `ItemProgressInput` con `steps_weight_mode?: 'equal' | 'custom'`.
- [x] 3.2 Ramificar `computeItemProgress` por modo. Default a `'equal'` cuando el campo no llega.
- [x] 3.3 Verificación mental: 4 módulos (1/1/1/1, módulo 1 done) en `'equal'` → (1+0+0+0)/4 = 25% ✓; mismos en `'custom'` → totalWeight=4, accum=1, 1/4 = 25% ✓; 3 módulos (30/50/20, primer done) en `'custom'` → 30/100 = 30% ✓.
- [x] 3.4 `stepsSummary` y `isStepEffectivelyDone` quedaron intactos.

## 4. Server actions

- [x] 4.1 `setStepsWeightModeAction` en `src/lib/actions/item-weight-mode.ts`. Valida con Zod, verifica ownership del ítem, hace `revalidatePath` de `/item/:id`, `/dashboard`, `/biblioteca`, `/stats`.
- [x] 4.2 `normalizeStepsWeightsAction({ item_id })` en el mismo archivo. Reescala proporcionalmente; si todos son 0, reparto igualitario; redondea a 2 decimales y el último módulo absorbe el residuo para que la suma sea 100.00 exacto. Devuelve los pesos nuevos para que el editor actualice state local.
- [x] 4.3 Verificado: `createStepAction`, `updateStepAction`, `deleteStepAction`, `reorderStepsAction`, `toggleStepAction` no validan suma — siguen aceptando estados intermedios.
- [x] 4.4 El check de columna `steps_weight_mode` solo puede fallar si llega un valor fuera del enum, y Zod lo filtra antes. No hace falta ampliar `mapPgError`.

## 5. Lectura del modo en queries

- [x] 5.1 `computeItemProgress` se consume solo en `dashboard/page.tsx` e `item-progress-shell.tsx`. `biblioteca/page.tsx` usa `current_units/total_units` directo (sin steps) — limitación preexistente, fuera de scope; `stats/page.tsx` no usa progreso por ítem; `sesion` y `completado` tampoco.
- [x] 5.2 `steps_weight_mode` agregado a los `select` de `dashboard/page.tsx` y `item/[id]/page.tsx`, propagado al `ItemForShell` y al cálculo en `ItemHero` / `ItemRow`.
- [ ] 5.3 Verificación visual de cada vista — pendiente smoke manual. _(Manual.)_

## 6. UI: editor de pasos (`steps-editor.tsx`)

- [x] 6.1 `StepsEditor` recibe `weightMode` y `onWeightModeChange` como props (lo pasa `ItemProgressShell`).
- [x] 6.2 `WeightModeToggle` agregado al lado del subtítulo del editor; dispara `setStepsWeightModeAction` (vía el callback del padre, con rollback en error).
- [x] 6.3 En `'equal'`, los inputs `%` de `ModuleRow` y `NewStepForm` no se renderizan. `NewStepForm` envía `weight_pct: 1` por default cuando el modo es `'equal'`.
- [x] 6.4 Línea "Suma actual: X / 100" debajo del listado en `'custom'`; color `text-muted` si = 100, `text-amber-300` si ≠ 100. Usa epsilon de 0.01 para tolerar errores de redondeo.
- [x] 6.5 Banner discreto (`bg-amber-500/10`) sobre la lista cuando suma ≠ 100, con botón inline "Normalizar a 100".
- [x] 6.6 "Normalizar a 100" llama `normalizeStepsWeightsAction(item_id)` y aplica los pesos devueltos al state local con `setSteps`.
- [x] 6.7 Subtítulo: en `'equal'` muestra solo "X de Y módulos completados · Z%"; en `'custom'` mantiene "del peso total".
- [x] 6.8 El banner es solo visual. Ninguna server action de pasos depende de la suma — todas las operaciones (crear, renombrar, mover, marcar, borrar) siguen aceptándose en cualquier estado.

## 7. UI: creación de ítem

- [x] 7.1 La pantalla `/item/nuevo` no define módulos (los pasos se agregan en el detalle). No hace falta toggle ahí.
- [x] 7.2 Ítems nuevos quedan en `'equal'` por DB default sin pedir nada al usuario.

## 8. Verificación

- [x] 8.1 `npm run lint` — 5 errores preexistentes idénticos a los listados en CLAUDE.md; no se introdujo ninguno nuevo.
- [x] 8.2 `npm run build` — compilación limpia, TypeScript ok, todas las rutas generadas.
- [ ] 8.3 Smoke manual con un ítem viejo: el porcentaje no cambió tras la migración. _(Manual.)_
- [ ] 8.4 Smoke manual creando un ítem nuevo con 4 módulos en `'equal'`. _(Manual.)_
- [ ] 8.5 Smoke manual cambiando a `'custom'` y agregando módulos uno por uno. _(Manual.)_
- [ ] 8.6 Smoke manual de consistencia entre dashboard / biblioteca / detalle / stats. _(Manual.)_

## 9. Documentación

- [x] 9.1 `CLAUDE.md` actualizado: `items` ahora menciona `scope` y `steps_weight_mode`.
- [x] 9.2 No se agregaron README/docs extra — los specs cubren el comportamiento.

## 10. Refinements post-smoke

- [x] 10.1 Migración aplicada en Supabase vía MCP. 8 ítems verificados (3 quedaron en `'custom'` por tener pasos, 5 en `'equal'`).
- [x] 10.2 Bug encontrado en smoke: inputs de peso usaban `defaultValue`, no reflejaban cambios de state post-normalize. Fix: agregar `key={module.weight_pct}` para forzar remount.
- [x] 10.3 Bug encontrado en smoke: normalize producía decimales feos (40, 19.84, 19.84, 19.84 = 99.52). Fix: cambiar a método del residuo mayor (Hamilton) sobre enteros. Mismo input ahora produce 40, 20, 20, 20 = 100 exacto.
- [x] 10.4 Spec y design actualizados con el nuevo algoritmo y el escenario de "números cerrados".
