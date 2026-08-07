-- ScannerDay Premium 2.0: extensao retrocompativel do contrato editorial.
alter table public.analyses add column if not exists risk_score numeric(5,2) check (risk_score between 0 and 100);
alter table public.analyses add column if not exists risk_level text check (risk_level is null or risk_level in ('Low','Medium','High','Very High'));
alter table public.analyses add column if not exists consensus_score numeric(5,2) check (consensus_score between 0 and 100);
alter table public.analyses add column if not exists score_breakdown jsonb;

create table if not exists public.analysis_history (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null unique references public.analyses(id) on delete cascade,
  date date,
  competition text,
  home_team text,
  away_team text,
  scanner_score numeric(5,2),
  confidence numeric(5,2),
  risk_score numeric(5,2),
  consensus_score numeric(5,2),
  odd numeric(6,3),
  fair_odd numeric(6,3),
  ev numeric(7,3),
  tip_status text,
  bet_result text not null default 'pending',
  profit numeric(9,3) not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists analysis_history_date_idx on public.analysis_history(date desc);
alter table public.analysis_history enable row level security;
drop policy if exists "authenticated analysis history is readable" on public.analysis_history;
create policy "authenticated analysis history is readable" on public.analysis_history for select to authenticated using (true);

create table if not exists public.scanner_analytics_cache (
  id smallint primary key default 1 check (id = 1),
  analyses_count integer not null default 0,
  official_count integer not null default 0,
  greens integer not null default 0,
  reds integer not null default 0,
  voids integer not null default 0,
  profit numeric(12,3) not null default 0,
  roi numeric(9,3),
  yield_value numeric(9,3),
  accuracy numeric(9,3),
  average_score numeric(6,2),
  average_confidence numeric(6,2),
  average_risk numeric(6,2),
  average_consensus numeric(6,2),
  score_chart jsonb not null default '[]'::jsonb,
  confidence_chart jsonb not null default '[]'::jsonb,
  risk_chart jsonb not null default '[]'::jsonb,
  league_chart jsonb not null default '[]'::jsonb,
  odd_chart jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.scanner_analytics_cache enable row level security;
drop policy if exists "authenticated scanner analytics is readable" on public.scanner_analytics_cache;
create policy "authenticated scanner analytics is readable" on public.scanner_analytics_cache for select to authenticated using (true);

create or replace function public.sync_analysis_history_row(target_analysis_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into public.analysis_history(analysis_id,date,competition,home_team,away_team,scanner_score,confidence,risk_score,consensus_score,odd,fair_odd,ev,tip_status,bet_result,profit,updated_at)
  select a.id,a.match_date,a.competition,a.home_team,a.away_team,a.scanner_score,a.confidence_index,a.risk_score,a.consensus_score,a.market_odd,a.fair_odd,a.expected_value,
    case when a.official_entry then 'Approved' else coalesce(a.editorial_status,'Monitor') end,
    coalesce(r.result::text,'pending'),
    case when not a.official_entry then 0 when r.result::text='green' then a.market_odd-1 when r.result::text='red' then -1 else 0 end,
    now()
  from public.analyses a left join public.results r on r.analysis_id=a.id where a.id=target_analysis_id
  on conflict(analysis_id) do update set date=excluded.date,competition=excluded.competition,home_team=excluded.home_team,away_team=excluded.away_team,
    scanner_score=excluded.scanner_score,confidence=excluded.confidence,risk_score=excluded.risk_score,consensus_score=excluded.consensus_score,
    odd=excluded.odd,fair_odd=excluded.fair_odd,ev=excluded.ev,tip_status=excluded.tip_status,bet_result=excluded.bet_result,profit=excluded.profit,updated_at=now();
end; $$;

create or replace function public.refresh_scanner_analytics() returns void
language plpgsql security definer set search_path=public as $$
declare settled_count integer; total_profit numeric;
begin
  select count(*),coalesce(sum(profit),0) into settled_count,total_profit from public.analysis_history where tip_status='Approved' and bet_result in ('green','red','void');
  insert into public.scanner_analytics_cache(id,analyses_count,official_count,greens,reds,voids,profit,roi,yield_value,accuracy,average_score,average_confidence,average_risk,average_consensus,score_chart,confidence_chart,risk_chart,league_chart,odd_chart,updated_at)
  select 1,
    (select count(*) from public.analysis_history),
    (select count(*) from public.analysis_history where tip_status='Approved'),
    (select count(*) from public.analysis_history where tip_status='Approved' and bet_result='green'),
    (select count(*) from public.analysis_history where tip_status='Approved' and bet_result='red'),
    (select count(*) from public.analysis_history where tip_status='Approved' and bet_result='void'),
    total_profit,case when settled_count>0 then total_profit/settled_count*100 end,case when settled_count>0 then total_profit/settled_count*100 end,
    case when (select count(*) from public.analysis_history where tip_status='Approved' and bet_result in ('green','red'))>0 then
      (select count(*)::numeric*100/nullif((select count(*) from public.analysis_history where tip_status='Approved' and bet_result in ('green','red')),0) from public.analysis_history where tip_status='Approved' and bet_result='green') end,
    (select avg(scanner_score) from public.analysis_history),(select avg(confidence) from public.analysis_history),(select avg(risk_score) from public.analysis_history),(select avg(consensus_score) from public.analysis_history),
    coalesce((select jsonb_agg(x order by bucket) from (select floor(scanner_score/10)*10 bucket,count(*) total,count(*) filter(where bet_result='green') greens from public.analysis_history where tip_status='Approved' and bet_result in ('green','red') group by 1)x),'[]'),
    coalesce((select jsonb_agg(x order by bucket) from (select floor(confidence/10)*10 bucket,count(*) total,count(*) filter(where bet_result='green') greens from public.analysis_history where tip_status='Approved' and bet_result in ('green','red') group by 1)x),'[]'),
    coalesce((select jsonb_agg(x order by bucket) from (select floor(risk_score/10)*10 bucket,count(*) total,count(*) filter(where bet_result='red') reds from public.analysis_history where tip_status='Approved' and bet_result in ('green','red') and risk_score is not null group by 1)x),'[]'),
    coalesce((select jsonb_agg(x order by competition) from (select competition,count(*) total,sum(profit) profit,sum(profit)/nullif(count(*),0)*100 roi from public.analysis_history where tip_status='Approved' and bet_result in ('green','red','void') group by competition)x),'[]'),
    coalesce((select jsonb_agg(x order by bucket) from (select floor(odd*2)/2 bucket,count(*) total,sum(profit) profit,sum(profit)/nullif(count(*),0)*100 roi from public.analysis_history where tip_status='Approved' and bet_result in ('green','red','void') group by 1)x),'[]'),now()
  on conflict(id) do update set analyses_count=excluded.analyses_count,official_count=excluded.official_count,greens=excluded.greens,reds=excluded.reds,voids=excluded.voids,profit=excluded.profit,roi=excluded.roi,yield_value=excluded.yield_value,accuracy=excluded.accuracy,average_score=excluded.average_score,average_confidence=excluded.average_confidence,average_risk=excluded.average_risk,average_consensus=excluded.average_consensus,score_chart=excluded.score_chart,confidence_chart=excluded.confidence_chart,risk_chart=excluded.risk_chart,league_chart=excluded.league_chart,odd_chart=excluded.odd_chart,updated_at=now();
end; $$;

create or replace function public.on_analysis_history_change() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.sync_analysis_history_row(coalesce(new.id,old.id)); perform public.refresh_scanner_analytics(); return coalesce(new,old); end; $$;
create or replace function public.on_result_history_change() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.sync_analysis_history_row(coalesce(new.analysis_id,old.analysis_id)); perform public.refresh_scanner_analytics(); return coalesce(new,old); end; $$;
drop trigger if exists analyses_history_sync on public.analyses;
create trigger analyses_history_sync after insert or update on public.analyses for each row execute function public.on_analysis_history_change();
drop trigger if exists results_history_sync on public.results;
create trigger results_history_sync after insert or update on public.results for each row execute function public.on_result_history_change();

insert into public.analysis_history(analysis_id,date,competition,home_team,away_team,scanner_score,confidence,risk_score,consensus_score,odd,fair_odd,ev,tip_status,bet_result,profit)
select a.id,a.match_date,a.competition,a.home_team,a.away_team,a.scanner_score,a.confidence_index,a.risk_score,a.consensus_score,a.market_odd,a.fair_odd,a.expected_value,case when a.official_entry then 'Approved' else coalesce(a.editorial_status,'Monitor') end,coalesce(r.result::text,'pending'),case when a.official_entry and r.result::text='green' then a.market_odd-1 when a.official_entry and r.result::text='red' then -1 else 0 end from public.analyses a left join public.results r on r.analysis_id=a.id where a.import_id is not null
on conflict(analysis_id) do nothing;
select public.refresh_scanner_analytics();
