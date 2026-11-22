-- Shared database for Thermal Waters of the World (Supabase free tier).
-- Anonymous accounts use Supabase anonymous sign-in; no names or emails are stored.
-- One table holds every community item; "doc" carries the item in the shape the site uses.
-- kind: review | photo | edit | confirm | cat | listing | added | list | verdict | report

create table if not exists public.items (
  kind text not null check (kind in ('review','photo','edit','confirm','cat','listing','added','list','verdict','report')),
  id text not null,
  spring text,
  user_id uuid not null default auth.uid(),
  doc jsonb not null,
  created_at timestamptz not null default now(),
  primary key (kind, id)
);
create index if not exists items_spring_idx on public.items (spring);
create index if not exists items_user_idx on public.items (user_id);
alter table public.items enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='items' and policyname='read community items') then
    create policy "read community items" on public.items for select using (kind <> 'list' or user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='items' and policyname='add own items') then
    create policy "add own items" on public.items for insert to authenticated with check (user_id = auth.uid() and kind <> 'verdict' and pg_column_size(doc) < 400000);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='items' and policyname='change own items') then
    create policy "change own items" on public.items for update to authenticated using (user_id = auth.uid() and kind <> 'verdict') with check (user_id = auth.uid() and kind <> 'verdict' and pg_column_size(doc) < 400000);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='items' and policyname='remove own items') then
    create policy "remove own items" on public.items for delete to authenticated using (user_id = auth.uid());
  end if;
end $$;

-- Photo storage: public read, each person uploads into their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 1500000, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='photos upload own folder') then
    create policy "photos upload own folder" on storage.objects for insert to authenticated
      with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='photos delete own') then
    create policy "photos delete own" on storage.objects for delete to authenticated
      using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

-- Verdict rows (the automatic checker's decision on a correction) are written only with the service key; nobody can add or change them from the site.

-- Moderation: owner page (admin.html), removal log, hourly automatic removal at 3 different reporters.
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt()->>'email' = 'andy@stiffcompetitionart.com'
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false, false)
$$;
create policy "admin removes any item" on public.items for delete using (public.is_admin());
create policy "admin restores items" on public.items for insert with check (public.is_admin());
create policy "admin removes any photo" on storage.objects for delete using (bucket_id = 'photos' and public.is_admin());

create table if not exists public.moderation_log (
  id bigserial primary key, removed_at timestamptz not null default now(), removed_by text not null,
  kind text not null, item_id text not null, spring text, user_id uuid, doc jsonb, reports jsonb,
  file text, file_pending boolean not null default false, restored boolean not null default false
);
alter table public.moderation_log enable row level security;
create policy "admin reads log" on public.moderation_log for select using (public.is_admin());
create policy "admin updates log" on public.moderation_log for update using (public.is_admin());
create policy "admin adds log" on public.moderation_log for insert with check (public.is_admin());

-- auto_moderate(): see live database (migration moderation_admin_and_auto_remove); scheduled with pg_cron:
--   select cron.schedule('tw-auto-moderate', '15 8 * * *', 'select public.auto_moderate(3)');
-- The older report-alert email trigger (items_report_alert -> notify_report()) is switched off.
