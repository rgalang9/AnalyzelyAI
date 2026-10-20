-- Pro waitlist: emails of people who want to hear when Pro launches.
-- Anyone (guests too) can add their email. Nobody can read the list through the app;
-- the owner reads it in the Supabase dashboard, which bypasses Row Level Security.

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null check (
    char_length(email) <= 320
    and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  created_at timestamptz not null default now()
);

-- One row per email, ignoring upper/lower case ("Me@x.com" = "me@x.com")
create unique index waitlist_email_unique_idx on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

create policy "Anyone can join the waitlist"
on public.waitlist for insert
to anon, authenticated
with check (true);

-- No select/update/delete policies: the list can't be read or changed from the app.

revoke all on table public.waitlist from anon, authenticated;
grant insert on table public.waitlist to anon, authenticated;
