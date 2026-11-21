-- Shared database plan for Thermal Waters of the World (free tier).
-- Anonymous accounts use Supabase anonymous sign-in; no names or emails are stored.
create table profiles (id uuid primary key references auth.users, handle text unique not null, created_at timestamptz default now());
create table springs (id text primary key, name text not null, lat double precision not null, lon double precision not null, country text, region text, elev int, temp_c numeric, cat int, src text, created_by uuid references profiles, created_at timestamptz default now());
create table reviews (spring text references springs, user_id uuid references profiles, clean int, staff int, cost int, access int, worth int, body text, created_at timestamptz default now(), primary key (spring, user_id));
create table photos (id uuid primary key default gen_random_uuid(), spring text references springs, user_id uuid references profiles, kind text check (kind in ('pro','snap')), book_terms_accepted boolean default false, caption text, path text not null, created_at timestamptz default now());
create table lists (user_id uuid references profiles, spring text references springs, kind text check (kind in ('been','want')), primary key (user_id, spring, kind));
create table edits (id uuid primary key default gen_random_uuid(), spring text references springs, field text, value text, user_id uuid references profiles, confirmations int default 0, created_at timestamptz default now());
create table listings (id uuid primary key default gen_random_uuid(), spring text references springs, business text, web text, body text, plan text check (plan in ('free','advert')), status text default 'pending', user_id uuid references profiles, created_at timestamptz default now());
alter table reviews enable row level security; alter table photos enable row level security; alter table lists enable row level security; alter table edits enable row level security; alter table listings enable row level security;
