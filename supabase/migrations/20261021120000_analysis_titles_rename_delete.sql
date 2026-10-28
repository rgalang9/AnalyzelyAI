-- History entries get a title (AI-written, or renamed by the user) and can be deleted.
--   title            shown in the sidebar; null means "use the file name"
--   title_is_custom  true once the user renames it, so the AI title never overwrites it
-- Row Level Security: people can only rename or delete their OWN analyses.
-- Deleting an analysis also deletes its messages and cleaning results automatically
-- (their tables already use "on delete cascade").

alter table public.analyses
  add column title text check (char_length(title) <= 100),
  add column title_is_custom boolean not null default false;

-- ---------- Rename ----------

create policy "Users can update their own analyses"
on public.analyses for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Only the title columns can be changed, nothing else about an analysis
grant update (title, title_is_custom) on table public.analyses to authenticated;

-- ---------- Delete ----------

create policy "Users can delete their own analyses"
on public.analyses for delete
to authenticated
using ((select auth.uid()) = user_id);

grant delete on table public.analyses to authenticated;

-- The saved dataset file in Storage, in the user's own folder
create policy "Users can delete datasets in their own folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'datasets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
