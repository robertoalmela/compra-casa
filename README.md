# Shared Shopping List MVP

MVP web/PWA para lista de la compra compartida entre familia.

## Objetivo
Resolver el caso real de Roberto:
- Android + iPhone
- gratis
- lista compartida
- marcar comprado
- saber quién lo compró
- interfaz simple y agradable

## Stack actual
- HTML
- CSS
- JavaScript vanilla
- Supabase (base de datos + realtime)
- GitHub Pages para publicar el frontend

## Estado actual
Esta versión ya no usa `localStorage` como fuente principal.
La lista está pensada para vivir en Supabase y compartirse entre varios móviles.

### Ya soporta
- crear hogar automáticamente por `invite_code`
- crear miembros por defecto
- seleccionar usuario activo
- crear productos
- asignar cantidad/categoría/notas
- marcar comprado
- registrar quién compró
- borrar productos
- limpiar comprados
- refresco realtime con Supabase
- responsive mobile-first
- instalable como PWA básica
- despliegue preparado para GitHub Pages

### Aún falta para dejarla 100% lista
- poner la URL real de Supabase y la anon key pública en `config.js`
- ejecutar `supabase/schema.sql` en el SQL editor
- hacer el primer push a GitHub y activar Pages

## Archivos clave
- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `config.example.js`
- `supabase/schema.sql`
- `.github/workflows/deploy-pages.yml`
- `GITHUB_PAGES.md`

## Configuración rápida
1. Crear proyecto en Supabase.
2. Abrir SQL Editor y pegar `supabase/schema.sql`.
3. Copiar `config.example.js` a `config.js` y rellenar:
   - `supabaseUrl`
   - `supabaseAnonKey`
   - `householdInviteCode`
4. Subir el repo a GitHub.
5. Activar GitHub Pages.

## Ejecutar local
```bash
cd /home/roberto/shared-shopping-list-app
python3 -m http.server 8137
```

Abrir: http://localhost:8137

## Nota de producto
Para este caso familiar, GitHub Pages + Supabase es la opción más limpia:
- sin app nativa
- sin backend propio
- sin costes al inicio
- fácil de compartir con hermanos
