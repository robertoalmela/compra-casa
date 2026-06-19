# GitHub Pages + Supabase = opción rápida y profesional

## Sí, se puede

GitHub Pages sirve perfecto para el **frontend estático** de esta app:
- HTML
- CSS
- JS
- manifest PWA
- service worker

## Lo que GitHub Pages NO hace
No sirve como backend ni base de datos en tiempo real.
Para eso hace falta algo como:
- Supabase free (recomendado)
- o Firebase free

## Arquitectura recomendada para vuestro caso
- **GitHub Pages**: publica la web
- **Supabase**: guarda lista, miembros, checks y comprador

Así tienes:
- gratis al principio
- enlace simple
- funciona en Android e iPhone
- aspecto profesional
- poco mantenimiento

## Flujo de despliegue
1. Subes este proyecto a GitHub.
2. Activas Pages en el repo.
3. El workflow `.github/workflows/deploy-pages.yml` publica la app.
4. Tus hermanos abren el enlace.
5. La añaden a pantalla de inicio.

## Siguiente paso técnico real
Ahora mismo el frontend usa `localStorage`, así que cada móvil tendría su copia.
Para compartir datos de verdad hay que conectar `app.js` a Supabase.

## Recomendación
Para hacerlo rápido y bien:
- mantener este frontend simple
- conectar solo lo mínimo a Supabase
- desplegar en GitHub Pages

Eso te deja una v1 usable en poco lío.
