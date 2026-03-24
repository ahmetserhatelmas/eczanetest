-- Supabase SQL Editor'da veya CLI ile çalıştırın.
-- Günlük nöbetçi eczane snapshot (CollectAPI senkronu).

create table if not exists public.duty_pharmacies (
  id uuid primary key default gen_random_uuid(),
  duty_date date not null,
  il text not null,
  ilce text not null default '',
  name text not null,
  address text not null default '',
  phone text not null default '',
  lat double precision not null,
  lng double precision not null,
  synced_at timestamptz not null default now(),
  constraint duty_pharmacies_lat_lng_check check (
    lat between -90 and 90 and lng between -180 and 180
  )
);

create index if not exists duty_pharmacies_duty_date_il_idx
  on public.duty_pharmacies (duty_date, il);

create index if not exists duty_pharmacies_duty_date_il_ilce_idx
  on public.duty_pharmacies (duty_date, il, ilce);

alter table public.duty_pharmacies enable row level security;

drop policy if exists "duty_pharmacies_select_public" on public.duty_pharmacies;

create policy "duty_pharmacies_select_public"
  on public.duty_pharmacies
  for select
  to anon, authenticated
  using (true);

-- Yazma: service_role (sunucu cron) RLS'i bypass eder; anon'a insert yok.

comment on table public.duty_pharmacies is 'CollectAPI günlük nöbetçi eczane verisi; Europe/Istanbul duty_date.';
