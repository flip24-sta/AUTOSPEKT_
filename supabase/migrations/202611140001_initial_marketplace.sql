create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email text not null default '',
  city text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null check (product in ('buy','sell','complete')),
  stripe_checkout_session_id text unique not null,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  status text not null default 'active' check (status in ('active','refunded','revoked')),
  purchased_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  make text not null default '',
  model text not null default '',
  year integer,
  mileage_km integer,
  fuel text not null default '',
  price_eur numeric(12,2) not null check (price_eur > 0),
  city text not null default '',
  image_urls text[] not null default '{}',
  status text not null default 'active' check (status in ('draft','active','sold','removed')),
  academy_priority boolean not null default false,
  boost_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists listings_market_order_idx on public.listings(status, academy_priority desc, boost_until desc, created_at desc);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  participant_a uuid not null references auth.users(id) on delete cascade,
  participant_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check (participant_a <> participant_b),
  unique(listing_id, participant_a, participant_b)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 5000),
  email_status text not null default 'queued' check (email_status in ('queued','sent','failed','not_configured')),
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_time_idx on public.messages(conversation_id, created_at);

create table if not exists public.checklists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Kontrola vozidla',
  vin text,
  plate text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.purchases enable row level security;
alter table public.listings enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.checklists enable row level security;
alter table public.notifications enable row level security;
alter table public.usage_events enable row level security;

revoke all on public.profiles, public.purchases, public.listings, public.conversations, public.messages, public.checklists, public.notifications, public.usage_events from anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

grant select on public.purchases to authenticated;
create policy purchases_select_own on public.purchases for select to authenticated using ((select auth.uid()) = user_id);

grant select on public.listings to anon, authenticated;
create policy listings_public_active on public.listings for select to anon, authenticated using (status = 'active');

grant select on public.conversations to authenticated;
create policy conversations_participant_select on public.conversations for select to authenticated using ((select auth.uid()) in (participant_a, participant_b));

grant select on public.messages to authenticated;
create policy messages_participant_select on public.messages for select to authenticated using (exists (
  select 1 from public.conversations c where c.id = conversation_id and (select auth.uid()) in (c.participant_a, c.participant_b)
));

grant select, insert, update, delete on public.checklists to authenticated;
create policy checklists_select_own on public.checklists for select to authenticated using ((select auth.uid()) = user_id);
create policy checklists_insert_own on public.checklists for insert to authenticated with check ((select auth.uid()) = user_id);
create policy checklists_update_own on public.checklists for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy checklists_delete_own on public.checklists for delete to authenticated using ((select auth.uid()) = user_id);

grant select, update on public.notifications to authenticated;
create policy notifications_select_own on public.notifications for select to authenticated using ((select auth.uid()) = user_id);
create policy notifications_update_own on public.notifications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select on public.usage_events to authenticated;
create policy usage_events_admin_select on public.usage_events for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

alter publication supabase_realtime add table public.messages;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-listings', 'vehicle-listings', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checklist-photos', 'checklist-photos', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy listing_photos_read on storage.objects for select to anon, authenticated using (bucket_id = 'vehicle-listings');
create policy listing_photos_insert_own on storage.objects for insert to authenticated with check (bucket_id = 'vehicle-listings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy listing_photos_update_own on storage.objects for update to authenticated using (bucket_id = 'vehicle-listings' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'vehicle-listings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy listing_photos_delete_own on storage.objects for delete to authenticated using (bucket_id = 'vehicle-listings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy checklist_photos_read_own on storage.objects for select to authenticated using (bucket_id = 'checklist-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy checklist_photos_insert_own on storage.objects for insert to authenticated with check (bucket_id = 'checklist-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy checklist_photos_update_own on storage.objects for update to authenticated using (bucket_id = 'checklist-photos' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'checklist-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy checklist_photos_delete_own on storage.objects for delete to authenticated using (bucket_id = 'checklist-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
