-- Paid plans (Stripe). Two tables:
--   user_plans  each user's plan and Stripe details. No row = Free.
--   ai_usage    how many AI questions each person has asked this month.
-- Written so running it again changes nothing.

-- ---------- Each user's plan ----------

create table if not exists public.user_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro', 'premium')),
  stripe_customer_id text unique,
  stripe_subscription_id text,
  subscription_status text, -- Stripe's word: active, past_due, canceled...
  current_period_end timestamptz, -- when the paid month ends
  updated_at timestamptz not null default now()
);

-- Row Level Security: people can read only their own row.
-- There are no insert/update/delete policies, so nobody can change a plan from the browser.
-- Only the server can, using the secret key (the Stripe webhook does this).
alter table public.user_plans enable row level security;

drop policy if exists "Users can view their own plan" on public.user_plans;
create policy "Users can view their own plan"
on public.user_plans for select
to authenticated
using ((select auth.uid()) = user_id);

-- ---------- AI questions per month ----------

-- subject: a signed-in user's id, or "guest:<scrambled IP address>" for guests.
create table if not exists public.ai_usage (
  subject text not null,
  month date not null, -- the first day of the month
  questions integer not null default 0,
  primary key (subject, month)
);

-- No policies at all: only the server can read or write this table.
alter table public.ai_usage enable row level security;

-- Counts one question if they're under the limit. Returns false if they've used them all.
-- One single step, so two questions at the same moment can't sneak past the limit.
create or replace function public.claim_ai_question(p_subject text, p_limit integer)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if p_limit < 1 then
    return false;
  end if;

  insert into public.ai_usage (subject, month, questions)
  values (p_subject, date_trunc('month', now() at time zone 'utc')::date, 1)
  on conflict (subject, month) do update
    set questions = public.ai_usage.questions + 1
    where public.ai_usage.questions < p_limit;

  return found;
end;
$$;

-- Gives a question back when the AI failed to answer it.
create or replace function public.release_ai_question(p_subject text)
returns void
language sql
set search_path = ''
as $$
  update public.ai_usage
  set questions = greatest(questions - 1, 0)
  where subject = p_subject
    and month = date_trunc('month', now() at time zone 'utc')::date;
$$;

-- Only the server may call these two.
revoke all on function public.claim_ai_question(text, integer) from public, anon, authenticated;
revoke all on function public.release_ai_question(text) from public, anon, authenticated;
grant execute on function public.claim_ai_question(text, integer) to service_role;
grant execute on function public.release_ai_question(text) to service_role;
