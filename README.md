# Compra Casa

PWA/web app gratis para lista de la compra compartida entre Android y iPhone.

**Estado: v1.0** — en uso diario. App publicada: https://robertoalmela.github.io/compra-casa/

## Qué hace ahora
- productos reutilizables: no se borran al comprarlos
- estado doble: `Comprar` / `En casa`
- cuando algo se gasta, vuelve a pendiente
- historial real de eventos (`created`, `bought`, `consumed`, `archived`)
- precio al comprar
- balance compartido tipo Tricount repartido entre todos los miembros
- sugerencias simples de reposición según ritmo medio de consumo
- realtime con Supabase
- escáner de códigos de barras (Android Chrome; en iPhone el botón no aparece)
- compartir la lista por WhatsApp/portapapeles
- instalable como app (iconos PNG para iPhone/Android)
- frontend estático compatible con GitHub Pages

## Stack
- HTML + CSS + JavaScript vanilla
- Supabase (DB + realtime)
- GitHub Pages (frontend)

## Modelo de datos
### `households`
Un hogar compartido identificado por `invite_code`.

### `members`
Miembros de ese hogar.

### `shopping_products`
Catálogo vivo de productos de casa.
Campos clave:
- `is_needed`: si toca comprarlo ahora
- `is_archived`: ocultarlo sin perder historial
- `last_price_cents`
- `last_bought_at`, `last_consumed_at`
- `last_bought_by_member_id`, `last_consumed_by_member_id`

### `shopping_events`
Libro de eventos del producto.
Tipos actuales:
- `created`
- `bought`
- `consumed`
- `needed`
- `archived`
- `unarchived`

Con esto el frontend puede calcular:
- quién adelantó más dinero
- quién debe más
- cuánto suele durar cada producto
- qué conviene reponer pronto

## Cómo configurarlo
1. Crear proyecto en Supabase.
2. Ejecutar entero `supabase/schema.sql` en el SQL editor.
3. Copiar `config.example.js` a `config.js`.
4. Rellenar:
   - `supabaseUrl`
   - `supabaseAnonKey`
   - `householdInviteCode`
   - `householdName`
   - `defaultMembers`
5. Levantar local o publicar en GitHub Pages.

## Ejecutar local
```bash
cd ~/Desktop/GitHub/00-active/shared-shopping-list-app
python3 -m http.server 8137
```

Abrir: http://127.0.0.1:8137/

## Notas de producto
- El balance reparte cada compra a partes iguales entre todos los miembros actuales.
- La predicción de reposición es una heurística local en JS, no IA externa.
- Si vienes de la versión anterior, hay cambio de esquema: aplica `supabase/schema.sql` antes de usar esta versión.
- GitHub Pages sigue valiendo porque todo lo dinámico vive en Supabase.
