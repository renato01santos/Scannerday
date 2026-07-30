create table if not exists public.suggested_bets (
  id uuid primary key default gen_random_uuid(),
  competition text not null,
  home_team text not null,
  away_team text not null,
  match_date date not null,
  match_time time,
  market text not null,
  selection text not null,
  entry_odd numeric(8,2) not null check (entry_odd > 1),
  stake numeric(8,2) not null default 1 check (stake >= 0),
  confidence integer not null check (confidence between 0 and 100),
  analysis text not null,
  instruction text,
  status text not null default 'published' check (status in ('draft','published','archived')),
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.suggested_bets enable row level security;
drop policy if exists "authenticated suggested bets are readable" on public.suggested_bets;
create policy "authenticated suggested bets are readable" on public.suggested_bets for select to authenticated using (status = 'published');
create index if not exists suggested_bets_published_at_idx on public.suggested_bets (published_at desc);
