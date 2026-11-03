-- Layer: Integration — row-level security and account functions against the real Supabase database.
-- Run in the SQL editor (as postgres). It creates two throwaway players (A, B), switches roles to act as
-- them and as a guest, deletes both at the end, and returns one row per check; every `ok` must be true.
-- First run 2026-11-03: checks 1-17 read back true from the results grid; the last two were confirmed by a
-- follow-up count (0 test users, 0 rows in profiles/progress/scores/friends).
create temp table r (n serial, check_name text, ok boolean, detail text);
grant all on r to authenticated, anon; grant usage on sequence r_n_seq to authenticated, anon;
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@rls-test.invalid'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'b@rls-test.invalid');
insert into r (check_name, ok, detail) select 'profiles auto-created', count(*) = 2, count(*)::text from public.profiles
  where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
create temp table codes as select id, friend_code from public.profiles where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
grant select on codes to authenticated;

-- as player A
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
insert into public.progress (user_id, stars) values (auth.uid(), '{"L1":3}');
select public.submit_score('L1', 500);
select public.submit_score('L1', 300);
insert into r (check_name, ok, detail) select 'A sees only own profile', count(*) = 1, count(*)::text from public.profiles;
insert into r (check_name, ok, detail) select 'lower score ignored (A keeps 500)', max(score) = 500, max(score)::text from public.scores;

-- as player B
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false);
insert into r (check_name, ok, detail) select 'B cannot read A progress', count(*) = 0, count(*)::text from public.progress;
insert into r (check_name, ok, detail) select 'B cannot read A scores', count(*) = 0, count(*)::text from public.scores;
with u as (update public.progress set stars = '{}' where user_id = '00000000-0000-0000-0000-00000000000a' returning 1)
  insert into r (check_name, ok, detail) select 'B cannot change A progress', count(*) = 0, count(*)::text || ' rows' from u;
do $$ begin
  insert into public.progress (user_id) values ('00000000-0000-0000-0000-00000000000a');
  insert into r (check_name, ok, detail) values ('B cannot write a save as A', false, 'inserted');
exception when others then insert into r (check_name, ok, detail) values ('B cannot write a save as A', true, sqlerrm); end $$;
do $$ begin
  insert into public.scores (user_id, level_id, score) values ('00000000-0000-0000-0000-00000000000a', 'L2', 99999);
  insert into r (check_name, ok, detail) values ('B cannot post a score as A', false, 'inserted');
exception when others then insert into r (check_name, ok, detail) values ('B cannot post a score as A', true, sqlerrm); end $$;
insert into r (check_name, ok, detail) select 'friend ranking empty before adding', count(*) = 0, count(*)::text from public.friend_ranking('L1');
insert into r (check_name, ok, detail) select 'top ranking shows A by nickname only', count(*) = 1 and bool_and(not is_me), string_agg(nickname || ':' || score, ',') from public.top_ranking('L1');
insert into r (check_name, ok, detail) select 'own code rejected', public.add_friend((select friend_code from codes where id = auth.uid())) is null, 'null';
insert into r (check_name, ok, detail) select 'add A by code', public.add_friend(lower((select friend_code from codes where id = '00000000-0000-0000-0000-00000000000a'))) = '그림자', 'ok';
insert into r (check_name, ok, detail) select 'friend ranking shows A after adding', count(*) = 1, string_agg(nickname || ':' || score, ',') from public.friend_ranking('L1');
do $$ begin
  insert into public.friends values (auth.uid(), '00000000-0000-0000-0000-00000000000a');
  insert into r (check_name, ok, detail) values ('friends table not writable directly', false, 'inserted');
exception when others then insert into r (check_name, ok, detail) values ('friends table not writable directly', true, sqlerrm); end $$;

-- as a guest (not signed in)
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
do $$ begin
  perform count(*) from public.profiles;
  insert into r (check_name, ok, detail) values ('guest cannot read profiles', false, 'read');
exception when others then insert into r (check_name, ok, detail) values ('guest cannot read profiles', true, sqlerrm); end $$;
do $$ begin
  perform public.top_ranking('L1');
  insert into r (check_name, ok, detail) values ('guest cannot call rankings', false, 'called');
exception when others then insert into r (check_name, ok, detail) values ('guest cannot call rankings', true, sqlerrm); end $$;

-- B deletes the account
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false);
select public.delete_me();
reset role;
insert into r (check_name, ok, detail) select 'delete_me removes B and B friendships', count(*) = 0, count(*)::text
  from public.friends where user_id = '00000000-0000-0000-0000-00000000000b' or friend_id = '00000000-0000-0000-0000-00000000000b';
insert into r (check_name, ok, detail) select 'B gone from auth.users', count(*) = 0, count(*)::text from auth.users where id = '00000000-0000-0000-0000-00000000000b';

-- clean up A (cascades to profile, progress, scores)
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
insert into r (check_name, ok, detail) select 'cleanup left no test rows', (select count(*) from public.profiles where id::text like '00000000-0000-0000-0000-00000000000%') + (select count(*) from public.scores where user_id::text like '00000000-0000-0000-0000-00000000000%') = 0, 'ok';
select n, check_name, ok, left(detail, 60) as detail from r order by n;
