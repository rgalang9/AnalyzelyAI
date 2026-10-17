-- Saved analysis history for logged-in users.
--   analyses           one row per uploaded file
--   analysis_messages  one row per question + AI answer (analysis text, stats, chart data)
--   storage "datasets" private bucket holding each dataset as JSON at <user id>/<analysis id>.json
-- Row Level Security makes sure people can only ever see their own rows and files.

-- ---------- analyses ----------

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_name text not null,
  row_count integer not null,
  column_count integer not null,
  dataset_path text not null,
  created_at timestamptz not null default now()
);

-- Sidebar query: "my analyses, newest first"
create index analyses_user_id_created_at_idx on public.analyses (user_id, created_at desc);

alter table public.analyses enable row level security;

create policy "Users can view their own analyses"
on public.analyses for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own analyses"
on public.analyses for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- ---------- analysis_messages ----------

create table public.analysis_messages (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question text not null,
  analysis text not null,
  stats jsonb not null default '[]'::jsonb,
  charts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index analysis_messages_analysis_id_created_at_idx
  on public.analysis_messages (analysis_id, created_at);
create index analysis_messages_user_id_idx on public.analysis_messages (user_id);

alter table public.analysis_messages enable row level security;

create policy "Users can view their own messages"
on public.analysis_messages for select
to authenticated
using ((select auth.uid()) = user_id);

-- Can only add messages to an analysis you own
create policy "Users can add messages to their own analyses"
on public.analysis_messages for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.analyses a
    where a.id = analysis_id and a.user_id = (select auth.uid())
  )
);

-- ---------- Data API access ----------
-- Guests (anon) get nothing; logged-in users can only read and add (RLS limits them to their own rows).

revoke all on table public.analyses, public.analysis_messages from anon, authenticated;
grant select, insert on table public.analyses, public.analysis_messages to authenticated;

-- ---------- Storage: private bucket for datasets ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('datasets', 'datasets', false, 52428800, array['application/json']);

create policy "Users can upload datasets to their own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'datasets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can read datasets in their own folder"
on storage.objects for select
to authenticated
using (
  bucket_id = 'datasets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
