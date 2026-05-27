-- ============================================================================
-- Migración: mejorar-porcentaje-avance
-- Fecha: 2026-05-27
-- Propósito: agregar `steps_weight_mode` a `items` para que el usuario decida
-- explícitamente cómo se reparte el peso entre los módulos de un ítem.
--   - 'equal' (default para ítems nuevos): todos los módulos pesan lo mismo;
--     `weight_pct` se ignora para el cálculo del progreso del ítem.
--   - 'custom': cada módulo aporta según su `weight_pct` (lógica previa).
--
-- Los ítems que YA tenían pasos al momento de aplicar la migración quedan en
-- 'custom' para no romper la lectura que sus usuarios venían viendo (ver
-- design.md, Decisión 2).
--
-- Aplicar en el dashboard de Supabase (SQL editor) o vía supabase CLI.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Nueva columna `steps_weight_mode` en items
-- ----------------------------------------------------------------------------
alter table public.items
  add column if not exists steps_weight_mode text not null default 'equal'
  check (steps_weight_mode in ('equal', 'custom'));

-- ----------------------------------------------------------------------------
-- 2. Migrar ítems pre-existentes con pasos a modo 'custom'
--    El DEFAULT 'equal' aplica solo a inserts nuevos.
-- ----------------------------------------------------------------------------
update public.items
   set steps_weight_mode = 'custom'
 where id in (select distinct item_id from public.item_steps);

commit;

-- ============================================================================
-- Verificación manual (no se ejecuta en la migración):
--   select steps_weight_mode, count(*) from public.items group by steps_weight_mode;
--   -- Debería mostrar 'custom' = N (ítems con pasos previos) y 'equal' = M (resto).
-- ============================================================================
