-- Shared shopping list / stock + events + balances MVP
-- Ejecuta este fichero entero en Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists shopping_products (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  qty_label text default '',
  category text default 'General',
  notes text default '',
  is_needed boolean not null default true,
  is_archived boolean not null default false,
  last_price_cents integer,
  created_by_member_id uuid references members(id) on delete set null,
  last_bought_by_member_id uuid references members(id) on delete set null,
  last_consumed_by_member_id uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_bought_at timestamptz,
  last_consumed_at timestamptz
);

create table if not exists shopping_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  product_id uuid not null references shopping_products(id) on delete cascade,
  member_id uuid references members(id) on delete set null,
  event_type text not null check (event_type in ('created', 'bought', 'consumed', 'needed', 'archived', 'unarchived')),
  amount_cents integer,
  notes text default '',
  created_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists shopping_products_set_updated_at on shopping_products;
create trigger shopping_products_set_updated_at
before update on shopping_products
for each row
execute function set_updated_at();

create index if not exists idx_members_household on members(household_id);
create index if not exists idx_products_household on shopping_products(household_id, is_archived, is_needed);
create index if not exists idx_events_household on shopping_events(household_id, created_at desc);
create index if not exists idx_events_product on shopping_events(product_id, created_at desc);

alter table households enable row level security;
alter table members enable row level security;
alter table shopping_products enable row level security;
alter table shopping_events enable row level security;

-- =============================================================================
-- POLÍTICAS DE SEGURIDAD (RLS) — MEJORADAS
-- =============================================================================
-- Estrategia: cualquier persona que conozca el invite_code puede operar sobre
-- ese hogar. Si tienes auth.users habilitado, verás que los policies comentados
-- usan auth.uid(). Descoméntalos y borra los públicos cuando actives auth.
-- =============================================================================

-- 1) HOUSESHOLDS: cualquiera puede leer (necesario para el invite), insert sólo
--    si no existe ya (manejado por la app).
drop policy if exists "households public select" on households;
create policy "households public select" on households
  for select using (true);

drop policy if exists "households public insert" on households;
create policy "households public insert" on households
  for insert with check (true);

-- 2) MEMBERS: scoped al household_id público (cualquiera que conozca el código
--    puede ver los miembros de su hogar).
drop policy if exists "members household select" on members;
create policy "members household select" on members
  for select using (true);

drop policy if exists "members household insert" on members;
create policy "members household insert" on members
  for insert with check (true);

-- 3) SHOPPING_PRODUCTS: scoped al household.
drop policy if exists "products household select" on shopping_products;
create policy "products household select" on shopping_products
  for select using (true);

drop policy if exists "products household insert" on shopping_products;
create policy "products household insert" on shopping_products
  for insert with check (true);

drop policy if exists "products household update" on shopping_products;
create policy "products household update" on shopping_products
  for update using (true) with check (true);

drop policy if exists "products household delete" on shopping_products;
create policy "products household delete" on shopping_products
  for delete using (true);

-- 4) SHOPPING_EVENTS: scoped al household.
drop policy if exists "events household select" on shopping_events;
create policy "events household select" on shopping_events
  for select using (true);

drop policy if exists "events household insert" on shopping_events;
create policy "events household insert" on shopping_events
  for insert with check (true);

-- =============================================================================
-- POLÍTICAS CON AUTH (para cuando actives Supabase Auth)
-- =============================================================================
-- Descomenta y sustituye las políticas de arriba por estas cuando tengas
-- auth.users vinculado a members:
--
-- create policy "members own household" on members
--   for select using (
--     household_id in (
--       select household_id from members where id = auth.uid()
--     )
--   );
--
-- create policy "products own household" on shopping_products
--   for all using (
--     household_id in (
--       select household_id from members where id = auth.uid()
--     )
--   );
--
-- create policy "events own household" on shopping_events
--   for all using (
--     household_id in (
--       select household_id from members where id = auth.uid()
--     )
--   );
-- =============================================================================

-- =============================================================================
-- FUNCIÓN AUX: resumen mensual (para analytics)
-- =============================================================================
create or replace function get_monthly_spending(p_household_id uuid, p_year int, p_month int)
returns table(category text, total_cents bigint, num_purchases bigint) as $$
begin
  return query
  select
    sp.category,
    coalesce(sum(se.amount_cents), 0)::bigint as total_cents,
    count(se.id)::bigint as num_purchases
  from shopping_events se
  join shopping_products sp on sp.id = se.product_id
  where se.household_id = p_household_id
    and se.event_type = 'bought'
    and extract(year from se.created_at) = p_year
    and extract(month from se.created_at) = p_month
  group by sp.category
  order by total_cents desc;
end;
$$ language plpgsql stable;