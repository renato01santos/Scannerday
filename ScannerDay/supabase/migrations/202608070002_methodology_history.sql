alter table public.analyses add column if not exists methodology_version text;
alter table public.analysis_history add column if not exists selection text;
alter table public.analysis_history add column if not exists classification text;
alter table public.analysis_history add column if not exists methodology_version text;

update public.analyses a set methodology_version=coalesce(nullif(i.raw_json->>'methodology_version',''),i.methodology)
from public.imports i where a.import_id=i.id and a.methodology_version is null;

create or replace function public.sync_analysis_history_row(target_analysis_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into public.analysis_history(analysis_id,date,competition,home_team,away_team,selection,scanner_score,confidence,risk_score,consensus_score,odd,fair_odd,ev,classification,tip_status,bet_result,profit,methodology_version,updated_at)
  select a.id,a.match_date,a.competition,a.home_team,a.away_team,a.selection,a.scanner_score,a.confidence_index,a.risk_score,a.consensus_score,a.market_odd,a.fair_odd,a.expected_value,a.classification,
    case when a.official_entry then 'Approved' else coalesce(a.editorial_status,'Monitor') end,
    coalesce(r.result::text,'pending'),
    case when not a.official_entry then 0 when r.result::text='green' then a.market_odd-1 when r.result::text='red' then -1 else 0 end,
    a.methodology_version,now()
  from public.analyses a left join public.results r on r.analysis_id=a.id where a.id=target_analysis_id
  on conflict(analysis_id) do update set date=excluded.date,competition=excluded.competition,home_team=excluded.home_team,away_team=excluded.away_team,selection=excluded.selection,
    scanner_score=excluded.scanner_score,confidence=excluded.confidence,risk_score=excluded.risk_score,consensus_score=excluded.consensus_score,
    odd=excluded.odd,fair_odd=excluded.fair_odd,ev=excluded.ev,classification=excluded.classification,tip_status=excluded.tip_status,bet_result=excluded.bet_result,
    profit=excluded.profit,methodology_version=excluded.methodology_version,updated_at=now();
end; $$;

select public.sync_analysis_history_row(id) from public.analyses where import_id is not null;
