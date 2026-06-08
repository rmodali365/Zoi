-- Switch ranking from per-sentiment tiers to a single overall ranked list per user.
-- Sentiment now only seeds the initial third (loved=top, liked=middle, fine=lower);
-- rank_key orders the whole list, and binary comparison refines exact position.

drop index if exists experiences_user_sentiment_rank;
create index if not exists experiences_user_rank
  on public.experiences (user_id, rank_key);

-- Dev reset: existing rank_keys were scoped per-sentiment and don't compose into a
-- valid global order. Clear the handful of test rows so the new model starts clean.
truncate table public.experiences cascade;
