## ADDED Requirements

### Requirement: Página 404 a nivel raíz

La aplicación SHALL renderizar una página 404 con la estética del producto cuando un usuario navegue a una ruta desconocida que no esté cubierta por un `not-found.tsx` más específico.

#### Scenario: Usuario navega a una ruta inexistente

- **WHEN** un usuario navega a una URL que no corresponde a ninguna ruta definida (por ejemplo, `/ruta-que-no-existe`)
- **THEN** el sistema renderiza la página definida en `src/app/not-found.tsx`
- **AND** la respuesta HTTP tiene status code 404

#### Scenario: La página hereda el layout raíz

- **WHEN** se renderiza la página 404 raíz
- **THEN** la página utiliza el layout raíz (`src/app/layout.tsx`) con `lang="es"`, fuentes Geist y modo oscuro
- **AND** NO se renderiza el header autenticado de `(app)/layout.tsx`

### Requirement: Contenido de la página 404 raíz

La página 404 raíz SHALL mostrar un mensaje en español con un enlace de retorno, manteniendo coherencia visual con el `not-found.tsx` existente para ítems.

#### Scenario: Estructura del mensaje

- **WHEN** se renderiza la página 404 raíz
- **THEN** la página muestra un emoticón decorativo, un título tipo heading, una descripción breve y un enlace de retorno
- **AND** los textos están en español

#### Scenario: Enlace de retorno

- **WHEN** se renderiza la página 404 raíz
- **THEN** la página incluye un enlace (`<Link>` de Next.js) que apunta a `/`
- **AND** al hacer clic, el proxy de autenticación decide si redirigir a `/dashboard` (usuario autenticado) o `/login` (no autenticado)

#### Scenario: Convivencia con el proxy de autenticación

- **WHEN** un usuario autenticado navega a una ruta desconocida (por ejemplo `/asdfqwerty`)
- **THEN** el proxy permite el request y Next.js renderiza la página 404 raíz con status 404

#### Scenario: Ruta desconocida dentro de un grupo público

- **WHEN** cualquier usuario (con o sin sesión) navega a una ruta desconocida cuyo prefijo es público según `PUBLIC_PATHS` del proxy (por ejemplo `/login/asdfqwerty`)
- **THEN** el proxy no redirige y Next.js renderiza la página 404 raíz con status 404

#### Scenario: Ruta privada desconocida sin sesión

- **WHEN** un usuario no autenticado navega a una ruta desconocida fuera de los prefijos públicos
- **THEN** el proxy redirige a `/login` (comportamiento existente del proxy)
- **AND** la página 404 raíz no se renderiza en ese caso (el redirect ocurre antes)
