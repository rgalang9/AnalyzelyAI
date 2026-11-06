-- Daily caps on AI data cleaning and AI auto-titles, and no more guest AI questions.
-- Works like ai_usage: the server counts a use before calling the AI, and gives it back if the
-- AI fails. Written so running it again changes nothing.

-- ---------- Uses per day ----------

-- One row per user, per feature, per day. A new day starts at midnight UTC.
create table if not exists public.ai_daily_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null check (feature in ('clean', 'title')),
  day date not null,
  uses integer not null default 0,
  primary key (user_id, feature, day)
);

-- No policies at all: only the server can read or write this table.
alter table public.ai_daily_usage enable row level security;

-- Counts one use if they're under the limit. Returns false if they've used them all today.
-- One single step, so two uses at the same moment can't sneak past the limit.
create or replace function public.claim_ai_daily_use(p_user_id uuid, p_feature text, p_limit integer)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if p_limit < 1 then
    return false;
  end if;

  insert into public.ai_daily_usage (user_id, feature, day, uses)
  values (p_user_id, p_feature, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, feature, day) do update
    set uses = public.ai_daily_usage.uses + 1
    where public.ai_daily_usage.uses < p_limit;

  return found;
end;
$$;

-- Gives a use back when the AI failed.
create or replace function public.release_ai_daily_use(p_user_id uuid, p_feature text)
returns void
language sql
set search_path = ''
as $$
  update public.ai_daily_usage
  set uses = greatest(uses - 1, 0)
  where user_id = p_user_id
    and feature = p_feature
    and day = (now() at time zone 'utc')::date;
$$;

-- Only the server may call these two.
revoke all on function public.claim_ai_daily_use(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.release_ai_daily_use(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_ai_daily_use(uuid, text, integer) to service_role;
grant execute on function public.release_ai_daily_use(uuid, text) to service_role;

-- ---------- Guests no longer ask AI questions ----------

-- Removes the guest counts, which were keyed on scrambled internet addresses.
delete from public.ai_usage where subject like 'guest:%';
