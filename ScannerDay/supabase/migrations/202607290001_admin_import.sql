create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  schema_version text not null,
  methodology text not null,
  generated_at timestamptz not null,
  imported_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  file_name text not null default 'scannerday.json',
  status text not null default 'published' check (status in ('published', 'failed')),
  analysis_count integer not null default 0,
  raw_json jsonb not null
);

alter table public.analyses alter column game_id drop not null;
alter table public.analyses add column if not exists import_id uuid references public.imports(id) on delete cascade;
alter table public.analyses add column if not exists competition text;
alter table public.analyses add column if not exists home_team text;
alter table public.analyses add column if not exists away_team text;
alter table public.analyses add column if not exists match_date date;
alter table public.analyses add column if not exists match_time time;
alter table public.analyses add column if not exists stadium text;
alter table public.analyses add column if not exists selection text;
alter table public.analyses add column if not exists market text;
alter table public.analyses add column if not exists minimum_entry_odd numeric(6,3);
alter table public.analyses add column if not exists scanner_probability numeric(5,2);
alter table public.analyses add column if not exists market_probability numeric(5,2);
alter table public.analyses add column if not exists classification text;
alter table public.analyses add column if not exists editorial_status text;
alter table public.analyses add column if not exists official_entry boolean not null default false;
alter table public.analyses add column if not exists stake numeric(7,2) not null default 0;
alter table public.analyses add column if not exists instruction text;
alter table public.analyses add column if not exists scanner_explain text;

create table if not exists public.predicted_scores (
  id bigint generated always as identity primary key,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  score text not null,
  probability numeric(5,2) not null check (probability between 0 and 100)
);

create table if not exists public.strengths (
  id bigint generated always as identity primary key,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  description text not null
);

create table if not exists public.risks (
  id bigint generated always as identity primary key,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  description text not null
);

create index if not exists imports_imported_at_idx on public.imports(imported_at desc);
create index if not exists analyses_import_id_idx on public.analyses(import_id);
create index if not exists editorial_analysis_ranking_idx on public.analyses(scanner_score desc, expected_value desc) where import_id is not null;

alter table public.imports enable row level security;
alter table public.predicted_scores enable row level security;
alter table public.strengths enable row level security;
alter table public.risks enable row level security;

create policy "published imports are readable" on public.imports for select using (status = 'published');
create policy "predicted scores are readable" on public.predicted_scores for select using (true);
create policy "strengths are readable" on public.strengths for select using (true);
create policy "risks are readable" on public.risks for select using (true);

create or replace function public.publish_analysis_import(
  payload jsonb,
  source_file_name text default 'scannerday.json',
  importing_user uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_import_id uuid;
  item jsonb;
  new_analysis_id uuid;
  score_item jsonb;
  text_item jsonb;
  total_count integer := jsonb_array_length(payload->'analyses');
  official_count integer := 0;
  monitoring_count integer := 0;
  rejected_count integer := 0;
begin
  insert into public.imports(schema_version, methodology, generated_at, user_id, file_name, analysis_count, raw_json)
  values (payload->>'schema_version', payload->>'methodology', (payload->>'generated_at')::timestamptz,
    importing_user, coalesce(nullif(source_file_name, ''), 'scannerday.json'), total_count, payload)
  returning id into new_import_id;

  for item in select value from jsonb_array_elements(payload->'analyses') loop
    insert into public.analyses(
      import_id, competition, home_team, away_team, match_date, match_time, stadium,
      selection, market, market_odd, minimum_entry_odd, probability, scanner_probability,
      implied_probability, market_probability, fair_odd, expected_value, scanner_score,
      confidence_index, classification, grade, editorial_status, official_entry, suggested_stake,
      stake, instruction, scanner_explain, ai_summary, metrics, model_version
    ) values (
      new_import_id, item->>'competition', item#>>'{match,home_team}', item#>>'{match,away_team}',
      (item#>>'{match,date}')::date, (item#>>'{match,time}')::time, item#>>'{match,stadium}',
      item#>>'{market,selection}', item#>>'{market,market}', (item#>>'{market,market_odd}')::numeric,
      (item#>>'{market,minimum_entry_odd}')::numeric, (item#>>'{scanner,scanner_probability}')::numeric,
      (item#>>'{scanner,scanner_probability}')::numeric, (item#>>'{scanner,market_probability}')::numeric,
      (item#>>'{scanner,market_probability}')::numeric, (item#>>'{scanner,fair_odd}')::numeric,
      (item#>>'{scanner,expected_value}')::numeric, (item#>>'{scanner,scanner_score}')::numeric,
      (item#>>'{scanner,confidence}')::numeric, item#>>'{scanner,classification}',
      case item#>>'{scanner,classification}' when 'A+' then 'A+'::public.analysis_grade when 'A' then 'A'::public.analysis_grade
        when 'B' then 'B'::public.analysis_grade when 'C' then 'C'::public.analysis_grade else 'rejected'::public.analysis_grade end,
      item#>>'{scanner,status}', coalesce((item#>>'{recommendation,official_entry}')::boolean, false),
      coalesce((item#>>'{recommendation,stake}')::numeric, 0), coalesce((item#>>'{recommendation,stake}')::numeric, 0),
      item#>>'{recommendation,instruction}', item->>'scanner_explain', item->>'scanner_explain',
      jsonb_build_object('predicted_scores', coalesce(item->'predicted_scores', '[]'::jsonb), 'strengths', coalesce(item->'strengths', '[]'::jsonb), 'risks', coalesce(item->'risks', '[]'::jsonb)),
      'editorial-import-v1'
    ) returning id into new_analysis_id;

    for score_item in select value from jsonb_array_elements(coalesce(item->'predicted_scores', '[]'::jsonb)) loop
      insert into public.predicted_scores(analysis_id, score, probability)
      values (new_analysis_id, score_item->>'score', (score_item->>'probability')::numeric);
    end loop;
    for text_item in select value from jsonb_array_elements(coalesce(item->'strengths', '[]'::jsonb)) loop
      insert into public.strengths(analysis_id, description) values (new_analysis_id, trim(both '"' from text_item::text));
    end loop;
    for text_item in select value from jsonb_array_elements(coalesce(item->'risks', '[]'::jsonb)) loop
      insert into public.risks(analysis_id, description) values (new_analysis_id, trim(both '"' from text_item::text));
    end loop;

    if coalesce((item#>>'{recommendation,official_entry}')::boolean, false) then official_count := official_count + 1;
    elsif lower(item#>>'{scanner,status}') in ('rejected', 'reprovado', 'discarded', 'descartado') then rejected_count := rejected_count + 1;
    else monitoring_count := monitoring_count + 1;
    end if;
  end loop;

  return jsonb_build_object('import_id', new_import_id, 'analyses', total_count,
    'official_entries', official_count, 'monitoring', monitoring_count, 'rejected', rejected_count);
end;
$$;

revoke all on function public.publish_analysis_import(jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.publish_analysis_import(jsonb, text, uuid) to service_role;
