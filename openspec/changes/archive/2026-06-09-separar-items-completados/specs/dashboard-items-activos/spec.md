## ADDED Requirements

### Requirement: Solo ítems en curso en el dashboard
El dashboard SHALL mostrar únicamente ítems que estén "en curso", definidos como:
- `status = 'active'` o `'paused'`, **AND**
- `computeItemProgress` menor a 1.

Los ítems con `status = 'done'`, `'abandoned'`, o cuyo progreso real sea 100% (aunque su `status` siga como `'active'`) NO deben aparecer en ninguna lista del dashboard.

#### Scenario: Ítems completados no visibles en el dashboard
- **WHEN** el usuario tiene ítems con `status = 'done'`
- **THEN** esos ítems no aparecen en ninguna sección del dashboard

#### Scenario: Ítems abandonados no visibles en el dashboard
- **WHEN** el usuario tiene ítems con `status = 'abandoned'`
- **THEN** esos ítems no aparecen en ninguna sección del dashboard

#### Scenario: Ítems al 100% no visibles aunque el status sea 'active'
- **WHEN** el usuario tiene un ítem con `status = 'active'` y todos sus módulos completados (progreso = 100%)
- **THEN** ese ítem no aparece en el dashboard

#### Scenario: Dashboard vacío cuando todos los ítems están finalizados
- **WHEN** el usuario tiene ítems pero ninguno cumple "en curso"
- **THEN** el dashboard muestra el estado vacío con llamada a la acción para crear un nuevo ítem
