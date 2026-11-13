-- Weekly play, for two friend features (roadmap 7): a friends ranking of this week's total score, and a friend quest
-- two friends fill together ("둘이 합쳐 N판" = the two players' runs this week added up; no extra table, no fake rivals).
-- Weeks are ISO weeks in Korean time, keyed on the server ('2026-W46'), so every phone agrees on the week.
-- Row-level secured like the other tables: a player writes only their own row; friends' rows are read through functions.

create table public.weekly (
  user_id    uuid references auth.users on delete cascade,
  week       text not null,
  score      bigint  not null default 0 check (score >= 0),
  runs       integer not null default 0 check (runs >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, week)
);
alter table public.weekly enable row level security;
create policy "own weekly" on public.weekly for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index weekly_week_score on public.weekly (week, score desc);

create function public.week_key() returns text
language sql stable as $$ select to_char(now() at time zone 'Asia/Seoul', 'IYYY-"W"IW') $$;

-- Add one finished run to this week's row: its score (a whole non-negative number) and one run.
create function public.add_weekly(p_score integer) returns void
language sql security invoker set search_path = public as $$
  insert into public.weekly (user_id, week, score, runs)
  values (auth.uid(), public.week_key(), greatest(0, least(coalesce(p_score, 0), 999999999)), 1)
  on conflict (user_id, week) do update
    set score = weekly.score + excluded.score, runs = weekly.runs + 1, updated_at = now();
$$;

-- Me and my friends this week, best first: nickname, score, runs (no ids leave the database).
create function public.friend_weekly()
returns table (nickname text, score bigint, runs integer, is_me boolean)
language sql security definer set search_path = public stable as $$
  select p.nickname, w.score, w.runs, w.user_id = auth.uid()
  from public.weekly w join public.profiles p on p.id = w.user_id
  where w.week = public.week_key()
    and (w.user_id = auth.uid() or w.user_id in (select friend_id from public.friends where user_id = auth.uid()))
  order by w.score desc limit 50;
$$;

grant select, insert, update on public.weekly to authenticated;
revoke all on function public.week_key() from public, anon;
revoke all on function public.add_weekly(integer) from public, anon;
revoke all on function public.friend_weekly() from public, anon;
grant execute on function public.week_key(), public.add_weekly(integer), public.friend_weekly() to authenticated;
