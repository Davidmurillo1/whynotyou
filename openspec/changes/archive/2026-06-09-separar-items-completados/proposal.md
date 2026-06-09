## Why

La página de inicio mezcla conceptualmente ítems en curso con ítems ya finalizados, aunque el filtro actual ya los excluye mediante `status = 'active'`. El problema real está en la Biblioteca: agrupa todos los estados (activo, pausado, finalizado, abandonado) en secciones de igual peso visual, lo que hace difícil separar de un vistazo "lo que estoy haciendo ahora" de "lo que ya terminé". Conforme crece el historial, la lista se vuelve ruidosa y la señal de lo activo se pierde.

## What Changes

- **Dashboard**: Confirmar y documentar como requisito explícito que solo se muestran ítems con `status = 'active'`. No se agregan más filtros ni cambios de código en esta página (el comportamiento ya es correcto).
- **Biblioteca**: Separar visualmente los ítems "en curso" (activos + pausados) de los ítems "finalizados" (completados + abandonados). Los finalizados se muestran en una sección distinta al final, visualmente diferenciada mediante un separador horizontal y opacidad reducida, sin requerir interacción para verse.

## Capabilities

### New Capabilities

- `dashboard-items-activos`: Regla que define qué ítems aparecen en la lista del dashboard — solo ítems con `status = 'active'`.
- `biblioteca-completados`: Organización visual de la Biblioteca que separa ítems en curso de ítems finalizados en secciones visualmente diferenciadas.

### Modified Capabilities

<!-- ninguna -->

## Impact

- `src/app/(app)/dashboard/page.tsx` — sin cambios de código, solo nuevo spec que documenta la regla existente.
- `src/app/(app)/biblioteca/page.tsx` — ajuste en la lógica de agrupamiento y en la renderización para separar los dos grupos (en curso vs. finalizados).
