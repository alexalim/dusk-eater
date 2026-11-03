-- Accounts for Dusk Eater: cloud save and friend rankings.
-- Sign-in itself (Apple, Google, Kakao) is Supabase Auth; this schema only holds game data.
-- Every table is row-level secured: a player reads and writes only their own rows; friends'
-- scores are read through the functions at the bottom, never by direct table access.

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nickname    text not null default '그림자' check (char_length(nickname) between 1 and 12),
  friend_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  created_at  timestamptz not null default now()
);

-- One save per account: stars and best scores per level id, plus the wallet (gems, skins).
create table public.progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  stars      jsonb not null default '{}',
  best       jsonb not null default '{}',
  wallet     jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Best score per level, kept as rows so rankings can be ordered by the database.
create table public.scores (
  user_id    uuid not null references auth.users (id) on delete cascade,
  level_id   text not null check (char_length(level_id) <= 16),
  score      integer not null check (score >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, level_id)
);
create index scores_level_rank on public.scores (level_id, score desc);

-- Friendship is stored both ways so each side can list the other.
create table public.friends (
  user_id   uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

alter table public.profiles enable row level security;
alter table public.progress enable row level security;
alter table public.scores   enable row level security;
alter table public.friends  enable row level security;

create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own progress" on public.progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own scores" on public.scores for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own friends" on public.friends for select using (user_id = auth.uid());

-- A profile is created with the account.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep only the higher score; a lower submission is ignored.
create function public.submit_score(p_level text, p_score integer) returns void
language sql security invoker set search_path = public as $$
  insert into public.scores (user_id, level_id, score) values (auth.uid(), p_level, p_score)
  on conflict (user_id, level_id) do update
    set score = greatest(scores.score, excluded.score), updated_at = now()
    where excluded.score > scores.score;
$$;

-- Add a friend by their 6-character code. Returns the friend's nickname, or null if no such code.
create function public.add_friend(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare f public.profiles;
begin
  select * into f from public.profiles where friend_code = upper(trim(p_code));
  if f.id is null or f.id = auth.uid() then return null; end if;
  insert into public.friends values (auth.uid(), f.id), (f.id, auth.uid()) on conflict do nothing;
  return f.nickname;
end $$;

-- Me and my friends on one level, best first.
create function public.friend_ranking(p_level text)
returns table (nickname text, score integer, is_me boolean)
language sql security definer set search_path = public stable as $$
  select p.nickname, s.score, s.user_id = auth.uid()
  from public.scores s join public.profiles p on p.id = s.user_id
  where s.level_id = p_level
    and (s.user_id = auth.uid() or s.user_id in (select friend_id from public.friends where user_id = auth.uid()))
  order by s.score desc limit 50;
$$;

-- Everyone on one level: top 50 nicknames and scores (no ids leave the database).
create function public.top_ranking(p_level text)
returns table (nickname text, score integer, is_me boolean)
language sql security definer set search_path = public stable as $$
  select p.nickname, s.score, s.user_id = auth.uid()
  from public.scores s join public.profiles p on p.id = s.user_id
  where s.level_id = p_level
  order by s.score desc limit 50;
$$;

-- In-app account deletion (App Store guideline 5.1.1(v)): removes the user and, by cascade, all their rows.
create function public.delete_me() returns void
language sql security definer set search_path = public, auth as $$
  delete from auth.users where id = auth.uid();
$$;

-- The project does not expose new tables automatically, so signed-in players get table access
-- explicitly here (row-level security above still limits them to their own rows). Guests get nothing.
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles, public.progress, public.scores to authenticated;
grant select on public.friends to authenticated;

revoke all on function public.delete_me() from public, anon;
revoke all on function public.add_friend(text) from public, anon;
revoke all on function public.friend_ranking(text) from public, anon;
revoke all on function public.top_ranking(text) from public, anon;
revoke all on function public.submit_score(text, integer) from public, anon;
grant execute on function public.delete_me(), public.add_friend(text), public.friend_ranking(text),
  public.top_ranking(text), public.submit_score(text, integer) to authenticated;
