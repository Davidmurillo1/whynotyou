## Why

Cualquier ruta desconocida actualmente cae en el 404 por defecto de Next.js, que rompe la estética del resto de la app y deja al usuario sin un camino claro de vuelta. Ya tenemos un not-found específico para ítems faltantes; falta el caso general.

## What Changes

- Nueva página `src/app/not-found.tsx` a nivel raíz, con la misma estética que el not-found de ítems.
- El usuario ve un mensaje en español, con la tipografía y modo oscuro del layout raíz, y un enlace para volver a `/` (que el proxy resuelve a `/dashboard` o `/login` según sesión).

## Capabilities

### New Capabilities
- `root-not-found-page`: página 404 a nivel raíz para rutas desconocidas, accesible tanto a usuarios autenticados como no autenticados.

### Modified Capabilities
<!-- Ninguna — no se tocan specs existentes -->

## Impact

- `src/app/not-found.tsx`: archivo nuevo.
- Sin cambios en rutas, server actions, esquemas ni dependencias.
- Sin impacto en autenticación: el archivo hereda el root layout, que no requiere sesión.
