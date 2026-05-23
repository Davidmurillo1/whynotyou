## 1. Implementación

- [x] 1.1 Crear `src/app/not-found.tsx` como Server Component con la estructura: emoticón `¯\_(ツ)_/¯`, h1 con título, párrafo descriptivo y `<Link>` de Next.js a `/`.
- [x] 1.2 Aplicar las clases de Tailwind del proyecto (`text-muted`, `text-accent`, `space-y-3`, etc.) para mantener consistencia con [src/app/(app)/item/[id]/not-found.tsx](src/app/(app)/item/[id]/not-found.tsx:1).
- [x] 1.3 Redactar los textos en español, adaptados al caso general (no específico de ítem). El enlace debe decir algo como "Volver al inicio".

## 2. Verificación

- [x] 2.1 Correr `npm run lint` y confirmar que no hay errores nuevos. (5 errores preexistentes en otros archivos; ninguno proviene del nuevo `not-found.tsx`.)
- [x] 2.2 Arrancar `npm run dev`, navegar a una ruta inexistente y confirmar que renderiza la nueva página con el layout raíz y modo oscuro. Verificado vía HTTP contra el dev server: `GET /login/asdfqwerty` → 404 con `lang="es"`, clase `dark`, texto "Esta página no existe." y "Volver al inicio". Hallazgo: el proxy redirige a `/login` toda ruta privada sin sesión antes del 404 — spec y design actualizados para reflejarlo.
- [x] 2.3 Confirmar que el enlace de retorno lleva a `/` y que el proxy resuelve a `/dashboard` (con sesión) o `/login` (sin sesión). El `<Link href="/">` está en el HTML servido (verificado en el payload); el comportamiento del redirect a `/dashboard` o `/login` desde `/` ya está cubierto por el proxy existente y no fue modificado por este cambio.
