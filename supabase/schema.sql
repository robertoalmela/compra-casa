-- Esquema mínimo para Supabase (free tier)

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

create table if not exists shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  qty text,
  category text default 'General',
  notes text default '',
  added_by_member_id uuid references members(id) on delete set null,
  bought_by_member_id uuid references members(id) on delete set null,
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger shopping_items_set_updated_at
before update on shopping_items
for each row
execute function set_updated_at();

alter table households enable row level security;
alter table members enable row level security;
alter table shopping_items enable row level security;

-- MVP simple: acceso por household_id desde frontend autenticado o invitación.
-- Política abierta para prototipo inicial; endurecer antes de producción pública.
create policy "mvp households read" on households for select using (true);
create policy "mvp households insert" on households for insert with check (true);
create policy "mvp members read" on members for select using (true);
create policy "mvp members insert" on members for insert with check (true);
create policy "mvp items read" on shopping_items for select using (true);
create policy "mvp items insert" on shopping_items for insert with check (true);
create policy "mvp items update" on shopping_items for update using (true);
create policy "mvp items delete" on shopping_items for delete using (true);
