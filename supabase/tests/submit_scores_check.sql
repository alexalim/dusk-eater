-- Layer: Integration — submit_scores (migration 0002) against the real Supabase database.
-- Run in the SQL editor (as postgres). One throwaway player, deleted at the end; every `ok` must be true.
-- First run 2026-11-03: 3/3 true (L1=500,L5=900; guest refused; nothing left behind).
create temp table r2 (n serial, check_name text, ok boolean, detail text);
grant all on r2 to authenticated, anon; grant usage on sequence r2_n_seq to authenticated, anon;
insert into auth.users (id, aud, role, email) values ('00000000-0000-0000-0000-00000000000c', 'authenticated', 'authenticated', 'c@rls-test.invalid');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', false);
select public.submit_scores('{"L1": 500, "L2": 12.5, "L3": -3, "L4": "x", "L5": 300}');
select public.submit_scores('{"L1": 400, "L5": 900}');
insert into r2 (check_name, ok, detail) select 'batch keeps valid, higher scores only', string_agg(level_id || '=' || score, ',' order by level_id) = 'L1=500,L5=900', string_agg(level_id || '=' || score, ',' order by level_id) from public.scores;
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
do $$ begin perform public.submit_scores('{"L1": 1}'); insert into r2 (check_name, ok, detail) values ('guest cannot submit', false, 'called');
exception when others then insert into r2 (check_name, ok, detail) values ('guest cannot submit', true, sqlerrm); end $$;
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000c';
insert into r2 (check_name, ok, detail) select 'cleanup', (select count(*) from public.scores where user_id = '00000000-0000-0000-0000-00000000000c') + (select count(*) from auth.users where email like '%@rls-test.invalid') = 0, 'ok';
select n, check_name, ok, left(detail, 60) as detail from r2 order by n;
