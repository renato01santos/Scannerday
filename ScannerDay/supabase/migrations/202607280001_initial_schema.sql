create extension if not exists pgcrypto;

create type public.user_role as enum ('user', 'analyst', 'admin');
create type public.game_status as enum ('scheduled', 'live', 'finished', 'cancelled', 'postponed');
create type public.analysis_grade as enum ('A+', 'A', 'B', 'C', 'rejected');
create type public.bet_result as enum ('pending', 'green', 'red', 'void');
create type public.service_health as enum ('online', 'unstable', 'offline');
create type public.run_status as enum ('queued', 'running', 'completed', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  role public.user_role not null default 'user',
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  name text not null,
  country text,
  logo_url text,
  active boolean not null default true,
  favorite boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  name text not null,
  country text,
  logo_url text,
  created_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  league_id uuid not null references public.leagues(id),
  home_team_id uuid not null references public.teams(id),
  away_team_id uuid not null references public.teams(id),
  starts_at timestamptz not null,
  status public.game_status not null default 'scheduled',
  home_score smallint,
  away_score smallint,
  context jsonb not null default '{}'::jsonb,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint different_teams check (home_team_id <> away_team_id)
);
create index games_starts_at_idx on public.games(starts_at);
create index games_league_idx on public.games(league_id);

create table public.odds (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  bookmaker text not null,
  market text not null default 'away_win_1x2',
  selection text not null default 'away',
  opening_odd numeric(6,3),
  current_odd numeric(6,3) not null check (current_odd > 1),
  captured_at timestamptz not null default now(),
  raw_data jsonb not null default '{}'::jsonb
);
create index odds_game_time_idx on public.odds(game_id, captured_at desc);

create table public.scanner_runs (
  id uuid primary key default gen_random_uuid(),
  status public.run_status not null default 'queued',
  stage smallint not null default 0 check (stage between 0 and 6),
  leagues_total integer not null default 0,
  leagues_processed integer not null default 0,
  games_total integer not null default 0,
  games_processed integer not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  scanner_run_id uuid references public.scanner_runs(id) on delete set null,
  probability numeric(5,2) not null check (probability between 0 and 100),
  implied_probability numeric(5,2) not null check (implied_probability between 0 and 100),
  fair_odd numeric(6,3) not null,
  market_odd numeric(6,3) not null,
  expected_value numeric(7,3) not null,
  scanner_score numeric(5,2) not null check (scanner_score between 0 and 100),
  confidence_index numeric(5,2) not null check (confidence_index between 0 and 100),
  grade public.analysis_grade not null,
  suggested_stake numeric(7,2) not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  ai_summary text,
  model_version text not null default 'rules-v1',
  created_at timestamptz not null default now()
);
create index analyses_game_created_idx on public.analyses(game_id, created_at desc);
create index analyses_ranking_idx on public.analyses(scanner_score desc, expected_value desc, probability desc);

create table public.analysis_events (
  id bigint generated always as identity primary key,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  event_type text not null,
  title text not null,
  previous_value jsonb,
  current_value jsonb,
  occurred_at timestamptz not null default now()
);
create index analysis_events_timeline_idx on public.analysis_events(analysis_id, occurred_at);

create table public.results (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null unique references public.analyses(id) on delete cascade,
  result public.bet_result not null default 'pending',
  profit_units numeric(9,3) not null default 0,
  roi numeric(8,3),
  yield_value numeric(8,3),
  notes text,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.watchlist (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  game_id uuid not null references public.games(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  game_id uuid references public.games(id) on delete cascade,
  type text not null,
  severity text not null default 'info',
  title text not null,
  message text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index alerts_user_created_idx on public.alerts(user_id, created_at desc);

create table public.scanner_weights (
  id smallint generated always as identity primary key,
  key text not null unique,
  label text not null,
  weight numeric(5,2) not null check (weight >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.service_status (
  service text primary key,
  health public.service_health not null default 'offline',
  latency_ms integer,
  message text,
  checked_at timestamptz not null default now()
);

create or replace view public.game_analysis_view as
select g.id, g.starts_at, g.status, l.name as league, l.country,
       ht.name as home_team, at.name as away_team,
       a.market_odd, a.probability, a.implied_probability, a.fair_odd,
       a.expected_value, a.scanner_score, a.confidence_index, a.grade,
       a.suggested_stake, a.metrics, a.ai_summary, a.created_at as analyzed_at
from public.games g
join public.leagues l on l.id = g.league_id
join public.teams ht on ht.id = g.home_team_id
join public.teams at on at.id = g.away_team_id
left join lateral (
  select * from public.analyses x where x.game_id = g.id order by x.created_at desc limit 1
) a on true;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name) values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.teams enable row level security;
alter table public.games enable row level security;
alter table public.odds enable row level security;
alter table public.scanner_runs enable row level security;
alter table public.analyses enable row level security;
alter table public.analysis_events enable row level security;
alter table public.results enable row level security;
alter table public.watchlist enable row level security;
alter table public.alerts enable row level security;
alter table public.scanner_weights enable row level security;
alter table public.system_settings enable row level security;
alter table public.service_status enable row level security;

create policy "public sports data is readable" on public.leagues for select using (true);
create policy "public teams are readable" on public.teams for select using (true);
create policy "public games are readable" on public.games for select using (true);
create policy "public odds are readable" on public.odds for select using (true);
create policy "analyses are readable" on public.analyses for select using (true);
create policy "events are readable" on public.analysis_events for select using (true);
create policy "results are readable" on public.results for select using (true);
create policy "scanner status is readable" on public.scanner_runs for select using (true);
create policy "weights are readable" on public.scanner_weights for select using (true);
create policy "service status is readable" on public.service_status for select using (true);
create policy "profile owner reads" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profile owner updates" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "watchlist owner all" on public.watchlist for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "alerts owner reads" on public.alerts for select using (user_id = auth.uid() or user_id is null);
create policy "alerts owner updates" on public.alerts for update using (user_id = auth.uid());
create policy "admins manage leagues" on public.leagues for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage weights" on public.scanner_weights for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage settings" on public.system_settings for all using (public.is_admin()) with check (public.is_admin());

insert into public.scanner_weights (key, label, weight) values
('recent_form','Forma recente',20),('home_away','Casa / Fora',15),('attack','Ataque',15),('defense','Defesa',15),
('market','Mercado',10),('injuries','Lesões',10),('motivation','Motivação',10),('history','Histórico',5);
insert into public.system_settings (key, value) values
('scanner_window_days','3'::jsonb),('min_odd','1.25'::jsonb),('max_odd','1.60'::jsonb),('default_stake','1.0'::jsonb);
insert into public.service_status(service,health,message) values
('games_api','offline','Aguardando credenciais'),('odds_api','offline','Aguardando credenciais'),
('statistics_api','offline','Aguardando credenciais'),('ai_api','offline','Aguardando credenciais');

