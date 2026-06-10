# Delta: Proyectos — navegación con Agenda

## MODIFIED Requirements

### Requirement: Navegación principal incluye Proyectos

El layout autenticado SHALL incluir una entrada "Proyectos" en la navegación principal (header desktop y nav inferior móvil), ubicada entre "Biblioteca" y "Categorías". La navegación SHALL incluir además la entrada "Agenda" (ruta `/agenda`) entre "Hoy" y "Biblioteca", quedando en siete entradas totales. La nav inferior móvil MUST renderizar las siete entradas en un grid `grid-cols-7` con ícono (lucide-react) + label corta por entrada, sin desbordar en viewports de 360px.

#### Scenario: Navegación desktop

- **WHEN** el usuario está autenticado y la viewport es ≥ md
- **THEN** el header muestra los links en orden: Hoy, Agenda, Biblioteca, Proyectos, Categorías, Stats, Ajustes

#### Scenario: Navegación móvil

- **WHEN** la viewport es < md
- **THEN** la nav inferior muestra los siete ítems en un grid `grid-cols-7`, cada uno con su ícono y su label
- **AND** la entrada "Proyectos" abre `/proyectos`
- **AND** la entrada "Agenda" abre `/agenda`
- **AND** ninguna label desborda su celda en un viewport de 360px
