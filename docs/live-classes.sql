-- Live Classes page: where the Google Meet links and the recordings links live (LAUNCH.md).
--
-- Run ONCE in Supabase -> SQL Editor (project zmuhinskhofhvyclkrbr).
--
-- Why a table: this repo and the tracker file are public, so a Meet link written into the code would be
-- readable by anyone. Here only paying Shonaverse members (and the admin) can read it.
--
--   * read:  a login whose app_metadata.sv_member_until is in the future (set by the member-signin
--            function for Daily Lessons members), or the admin (hello@speakshona.com)
--   * write: the admin only
--
-- The two Meet links are NOT in this file. After running it, add them in Table Editor -> live_classes
-- (or run an UPDATE ... SET meet_url = '...' WHERE id = 'kids' / 'adults').
--
-- Undo:  drop table public.live_classes;

begin;

create table if not exists public.live_classes (
  id             text primary key,            -- 'kids' | 'adults'
  title          text not null,
  blurb          text not null default '',
  day_of_week    int  not null default 5,     -- 0 = Sunday ... 5 = Friday
  start_time     text not null,               -- 'HH:MM' on the wall clock of tz
  end_time       text not null,
  tz             text not null default 'America/Vancouver',
  first_date     date not null,               -- no sessions before this day
  meet_url       text,
  recordings_url text,
  updated_at     timestamptz not null default now()
);

alter table public.live_classes enable row level security;

drop policy if exists live_classes_read on public.live_classes;
create policy live_classes_read on public.live_classes for select to authenticated
  using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'sv_member_until')::timestamptz, 'epoch'::timestamptz) > now()
    or (auth.jwt() ->> 'email') = 'hello@speakshona.com'
  );

drop policy if exists live_classes_admin on public.live_classes;
create policy live_classes_admin on public.live_classes for all to authenticated
  using ((auth.jwt() ->> 'email') = 'hello@speakshona.com')
  with check ((auth.jwt() ->> 'email') = 'hello@speakshona.com');

insert into public.live_classes (id, title, blurb, day_of_week, start_time, end_time, tz, first_date)
values
  ('kids',   'Kids class',   'Ages 7+',              5, '11:45', '12:30', 'America/Vancouver', '2026-10-09'),
  ('adults', 'Adults class', 'Every level welcome',  5, '12:45', '13:30', 'America/Vancouver', '2026-10-09')
on conflict (id) do nothing;

commit;
