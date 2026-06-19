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

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'households' and policyname = 'mvp households read') then
    create policy "mvp households read" on households for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'households' and policyname = 'mvp households insert') then
    create policy "mvp households insert" on households for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'members' and policyname = 'mvp members read') then
    create policy "mvp members read" on members for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'members' and policyname = 'mvp members insert') then
    create policy "mvp members insert" on members for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'shopping_products' and policyname = 'mvp products read') then
    create policy "mvp products read" on shopping_products for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'shopping_products' and policyname = 'mvp products insert') then
    create policy "mvp products insert" on shopping_products for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'shopping_products' and policyname = 'mvp products update') then
    create policy "mvp products update" on shopping_products for update using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'shopping_products' and policyname = 'mvp products delete') then
    create policy "mvp products delete" on shopping_products for delete using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'shopping_events' and policyname = 'mvp events read') then
    create policy "mvp events read" on shopping_events for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'shopping_events' and policyname = 'mvp events insert') then
    create policy "mvp events insert" on shopping_events for insert with check (true);
  end if;
end $$;