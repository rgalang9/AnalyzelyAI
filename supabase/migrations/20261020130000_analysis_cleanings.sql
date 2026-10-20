-- Data-cleaning results for each saved analysis (logged-in users only).
--   issues           every problem found, with its suggested fix (JSON)
--   fixed_issue_ids  which fixes the user has applied
-- The original file in Storage is never changed: the cleaned version is the
-- original with these fixes applied, so Undo and "Restore original" always work.
-- Row Level Security makes sure people can only ever see and change their own rows.

create table public.analysis_cleanings (
  analysis_id uuid primary key references public.analyses (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  issues jsonb not null default '[]'::jsonb,
  fixed_issue_ids text[] not null default '{}',
  ai_reviewed boolean not null default false,
  updated_at timestamptz not null default now()
);

create index analysis_cleanings_user_id_idx on public.analysis_cleanings (user_id);

alter table public.analysis_cleanings enable row level security;

create policy "Users can view their own cleanings"
on public.analysis_cleanings for select
to authenticated
using ((select auth.uid()) = user_id);

-- Can only add cleaning results to an analysis you own
create policy "Users can add cleanings to their own analyses"
on public.analysis_cleanings for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.analyses a
    where a.id = analysis_id and a.user_id = (select auth.uid())
  )
);

create policy "Users can update their own cleanings"
on public.analysis_cleanings for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- ---------- Data API access ----------
-- Guests (anon) get nothing; logged-in users can read, add, and update (RLS limits them to their own rows).

revoke all on table public.analysis_cleanings from anon, authenticated;
grant select, insert, update on table public.analysis_cleanings to authenticated;
