-- Submit many best scores in one call ({"L1": 1200, "L2": 800, ...}); each keeps only the higher value.
-- The first sync of a long-played device can carry 150+ levels, so this replaces one request per level.
create function public.submit_scores(p_scores jsonb) returns void
language sql security invoker set search_path = public as $$
  insert into public.scores (user_id, level_id, score)
  select auth.uid(), key, (value #>> '{}')::integer
  from jsonb_each(p_scores)
  -- whole non-negative numbers up to 9 digits only; anything else is skipped rather than failing the batch
  where char_length(key) <= 16 and jsonb_typeof(value) = 'number' and (value #>> '{}') ~ '^[0-9]{1,9}$'
  on conflict (user_id, level_id) do update
    set score = greatest(scores.score, excluded.score), updated_at = now()
    where excluded.score > scores.score;
$$;
revoke all on function public.submit_scores(jsonb) from public, anon;
grant execute on function public.submit_scores(jsonb) to authenticated;
