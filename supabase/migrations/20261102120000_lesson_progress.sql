-- Learn progress for signed-in users: one row per finished lesson, in any course (sql, python, excel, r).
-- This table was first made in the Supabase dashboard; this file records it in the repo.
-- It's written so running it again changes nothing.
-- Row Level Security: people can only read and add their own rows.

create table if not exists public.lesson_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  course text not null,
  lesson_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, course, lesson_id)
);

alter table public.lesson_progress enable row level security;

drop policy if exists "Users can view their own lesson progress" on public.lesson_progress;
create policy "Users can view their own lesson progress"
on public.lesson_progress for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can add their own lesson progress" on public.lesson_progress;
create policy "Users can add their own lesson progress"
on public.lesson_progress for insert
to authenticated
with check ((select auth.uid()) = user_id);
