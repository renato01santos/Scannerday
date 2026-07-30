alter table public.suggested_bets alter column home_team drop not null;
alter table public.suggested_bets alter column away_team drop not null;
alter table public.suggested_bets alter column match_date drop not null;
alter table public.suggested_bets add column if not exists tip_id text;
alter table public.suggested_bets add column if not exists match_name text;
alter table public.suggested_bets add column if not exists minimum_entry_odd numeric(8,2);
alter table public.suggested_bets add column if not exists scanner_score integer;
alter table public.suggested_bets add column if not exists expected_value numeric(8,2);
alter table public.suggested_bets add column if not exists bet_status text not null default 'Open';
alter table public.suggested_bets add column if not exists profit numeric(10,3);
alter table public.suggested_bets add column if not exists units numeric(10,3);
alter table public.suggested_bets add column if not exists closing_odd numeric(8,2);
alter table public.suggested_bets add column if not exists result text;
alter table public.suggested_bets add column if not exists final_score text;
alter table public.suggested_bets add column if not exists settled_at timestamptz;
update public.suggested_bets set tip_id='LEGACY-'||substr(id::text,1,8),match_name=concat_ws(' x ',home_team,away_team) where tip_id is null;
alter table public.suggested_bets alter column tip_id set not null;
create unique index if not exists suggested_bets_tip_id_key on public.suggested_bets(tip_id);
alter table public.suggested_bets drop constraint if exists suggested_bets_bet_status_check;
alter table public.suggested_bets add constraint suggested_bets_bet_status_check check (bet_status in ('Open','Won','Lost','Void','Half Won','Half Lost'));

create table if not exists public.tip_imports (
  id uuid primary key default gen_random_uuid(), import_type text not null check(import_type in ('tips','results')),
  schema_version text not null, generated_at timestamptz, file_name text not null, item_count integer not null,
  raw_json jsonb not null, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
alter table public.tip_imports enable row level security;

create or replace function public.publish_suggested_tips(payload jsonb, source_file_name text, importing_user uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item jsonb; imported_count int:=0; batch_id uuid;
begin
  if payload->>'schema_version'<>'1.0' or jsonb_typeof(payload->'tips')<>'array' or jsonb_array_length(payload->'tips')=0 then raise exception 'Contrato de apostas inválido'; end if;
  insert into tip_imports(import_type,schema_version,generated_at,file_name,item_count,raw_json,created_by)
  values('tips',payload->>'schema_version',nullif(payload->>'generated_at','')::timestamptz,coalesce(nullif(source_file_name,''),'scannerday-tips-v1.json'),jsonb_array_length(payload->'tips'),payload,importing_user) returning id into batch_id;
  for item in select * from jsonb_array_elements(payload->'tips') loop
    if coalesce(item->>'tip_id','')='' or coalesce(item->>'match','')='' or coalesce(item->>'selection','')='' then raise exception 'Aposta com campos obrigatórios ausentes'; end if;
    insert into suggested_bets(tip_id,competition,match_name,market,selection,entry_odd,minimum_entry_odd,stake,confidence,scanner_score,expected_value,analysis,instruction,status,bet_status,created_by,published_at)
    values(item->>'tip_id',item->>'competition',item->>'match',item->>'market',item->>'selection',(item->>'odd')::numeric,nullif(item->>'minimum_entry_odd','')::numeric,(item->>'stake')::numeric,(item->>'confidence')::int,nullif(item->>'scanner_score','')::int,nullif(item->>'expected_value','')::numeric,item->>'reason',nullif(item->>'instruction',''),'published','Open',importing_user,now());
    imported_count:=imported_count+1;
  end loop;
  return jsonb_build_object('import_id',batch_id,'tips',imported_count);
end $$;

create or replace function public.settle_suggested_tips(payload jsonb, source_file_name text, importing_user uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item jsonb; affected int; settled_count int:=0; batch_id uuid; calculated_profit numeric;
begin
  if payload->>'schema_version'<>'1.0' or jsonb_typeof(payload->'results')<>'array' or jsonb_array_length(payload->'results')=0 then raise exception 'Contrato de resultados inválido'; end if;
  insert into tip_imports(import_type,schema_version,generated_at,file_name,item_count,raw_json,created_by)
  values('results',payload->>'schema_version',nullif(payload->>'generated_at','')::timestamptz,coalesce(nullif(source_file_name,''),'scannerday-results-v1.json'),jsonb_array_length(payload->'results'),payload,importing_user) returning id into batch_id;
  for item in select * from jsonb_array_elements(payload->'results') loop
    if (item->>'status') not in ('Won','Lost','Void','Half Won','Half Lost') then raise exception 'Status inválido para %',item->>'tip_id'; end if;
    select case item->>'status' when 'Won' then stake*(entry_odd-1) when 'Lost' then -stake when 'Void' then 0 when 'Half Won' then stake*(entry_odd-1)/2 when 'Half Lost' then -stake/2 end into calculated_profit from suggested_bets where tip_id=item->>'tip_id';
    if not found then raise exception 'tip_id não encontrado: %',item->>'tip_id'; end if;
    update suggested_bets set bet_status=item->>'status',profit=coalesce(nullif(item->>'profit','')::numeric,calculated_profit),units=coalesce(nullif(item->>'units','')::numeric,coalesce(nullif(item->>'profit','')::numeric,calculated_profit)),closing_odd=nullif(item->>'closing_odd','')::numeric,result=nullif(item->>'result',''),final_score=nullif(item->>'final_score',''),settled_at=now() where tip_id=item->>'tip_id';
    get diagnostics affected=row_count; settled_count:=settled_count+affected;
  end loop;
  return jsonb_build_object('import_id',batch_id,'results',settled_count);
end $$;
revoke all on function public.publish_suggested_tips(jsonb,text,uuid) from public,anon,authenticated;
revoke all on function public.settle_suggested_tips(jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.publish_suggested_tips(jsonb,text,uuid) to service_role;
grant execute on function public.settle_suggested_tips(jsonb,text,uuid) to service_role;
