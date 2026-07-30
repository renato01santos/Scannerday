-- ScannerDay SaaS: dados esportivos somente para contas autenticadas.
drop policy if exists "public sports data is readable" on public.leagues;
drop policy if exists "public teams are readable" on public.teams;
drop policy if exists "public games are readable" on public.games;
drop policy if exists "public odds are readable" on public.odds;
drop policy if exists "analyses are readable" on public.analyses;
drop policy if exists "events are readable" on public.analysis_events;
drop policy if exists "results are readable" on public.results;
drop policy if exists "scanner status is readable" on public.scanner_runs;
drop policy if exists "weights are readable" on public.scanner_weights;
drop policy if exists "service status is readable" on public.service_status;

create policy "authenticated leagues are readable" on public.leagues for select to authenticated using (true);
create policy "authenticated teams are readable" on public.teams for select to authenticated using (true);
create policy "authenticated games are readable" on public.games for select to authenticated using (true);
create policy "authenticated odds are readable" on public.odds for select to authenticated using (true);
create policy "authenticated analyses are readable" on public.analyses for select to authenticated using (true);
create policy "authenticated events are readable" on public.analysis_events for select to authenticated using (true);
create policy "authenticated results are readable" on public.results for select to authenticated using (true);
create policy "authenticated scanner status is readable" on public.scanner_runs for select to authenticated using (true);
create policy "authenticated weights are readable" on public.scanner_weights for select to authenticated using (true);
create policy "authenticated service status is readable" on public.service_status for select to authenticated using (true);

-- Usuários podem editar o próprio nome, nunca o papel ou o plano.
revoke update on table public.profiles from authenticated;
grant update (name) on table public.profiles to authenticated;

drop policy if exists "published imports are readable" on public.imports;
drop policy if exists "predicted scores are readable" on public.predicted_scores;
drop policy if exists "strengths are readable" on public.strengths;
drop policy if exists "risks are readable" on public.risks;
create policy "authenticated imports are readable" on public.imports for select to authenticated using (status = 'published');
create policy "authenticated predicted scores are readable" on public.predicted_scores for select to authenticated using (true);
create policy "authenticated strengths are readable" on public.strengths for select to authenticated using (true);
create policy "authenticated risks are readable" on public.risks for select to authenticated using (true);
