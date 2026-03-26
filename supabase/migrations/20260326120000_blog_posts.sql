-- Blog yazıları: anon yalnızca yayınlananları okur; yazma service role + admin API.

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text not null default '',
  content text not null default '',
  published boolean not null default true,
  pin_to_home boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_posts_published_created_idx
  on public.blog_posts (published, created_at desc);

alter table public.blog_posts enable row level security;

create policy "blog_posts_select_published"
  on public.blog_posts for select
  to anon, authenticated
  using (published = true);

comment on table public.blog_posts is 'Site blogu; admin API service role ile yazar.';
