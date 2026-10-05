-- mazwi LAUNCH.md C3: lock down the lesson tracker's tables.
--
-- Run ONCE, in Supabase -> SQL Editor (project zmuhinskhofhvyclkrbr), AFTER the new tracker
-- (app.js signing members in) and the member-signin CORS change are live.
--
-- What it does
--   * adds user_id (the verified login) to the three tracker tables; new rows fill it in automatically
--   * only people signed in through speakshona.com (a "Shonaverse member" session) can read or write
--   * you can only add rows as yourself
--   * delete: the person who posted it, or the admin (hello@speakshona.com) - nobody else
--   * old rows (typed names, no user_id) are kept but become invisible: "start fresh"
--   * the 'missions' image bucket: only signed-in members can upload (anyone can still view a link)
--
-- "Shonaverse member session" = the login carries app_metadata.sv_member_until, which only the
-- member-signin function can set (both free and paying visitors get it; mazwi-only users don't).
--
-- Undo (opens everything up again - only if something goes wrong):
--   alter table public.lesson_missions disable row level security;
--   alter table public.lesson_mission_replies disable row level security;
--   alter table public.lesson_completions disable row level security;

begin;

-- 1. owner column ---------------------------------------------------------------------------
alter table public.lesson_missions        add column if not exists user_id uuid;
alter table public.lesson_mission_replies add column if not exists user_id uuid;
alter table public.lesson_completions     add column if not exists user_id uuid;

alter table public.lesson_missions        alter column user_id set default auth.uid();
alter table public.lesson_mission_replies alter column user_id set default auth.uid();
alter table public.lesson_completions     alter column user_id set default auth.uid();

-- one completion per person per lesson (the tracker upserts on this)
create unique index if not exists lesson_completions_user_lesson_uniq
  on public.lesson_completions (user_id, lesson_id);

-- 2. who counts as what ---------------------------------------------------------------------
create or replace function public.is_shonaverse_member() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'sv_member_until', '') <> ''
$$;

create or replace function public.is_shonaverse_admin() returns boolean
language sql stable as $$
  select public.is_shonaverse_member()
     and lower(coalesce(auth.jwt() ->> 'email', '')) = 'hello@speakshona.com'
$$;

-- 3. clear every old policy on the three tables, switch RLS on ------------------------------
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('lesson_missions', 'lesson_mission_replies', 'lesson_completions')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table public.lesson_missions        enable row level security;
alter table public.lesson_mission_replies enable row level security;
alter table public.lesson_completions     enable row level security;

-- 4. missions + replies: members read all, add their own, delete their own (admin: any) -----
create policy missions_read on public.lesson_missions for select to authenticated
  using (public.is_shonaverse_member() and user_id is not null);
create policy missions_add on public.lesson_missions for insert to authenticated
  with check (public.is_shonaverse_member() and user_id = auth.uid());
create policy missions_delete on public.lesson_missions for delete to authenticated
  using (public.is_shonaverse_member() and (user_id = auth.uid() or public.is_shonaverse_admin()));

create policy replies_read on public.lesson_mission_replies for select to authenticated
  using (public.is_shonaverse_member() and user_id is not null);
create policy replies_add on public.lesson_mission_replies for insert to authenticated
  with check (public.is_shonaverse_member() and user_id = auth.uid());
create policy replies_delete on public.lesson_mission_replies for delete to authenticated
  using (public.is_shonaverse_member() and (user_id = auth.uid() or public.is_shonaverse_admin()));

-- 5. completions: private to the person (admin can read all) -------------------------------
create policy completions_read on public.lesson_completions for select to authenticated
  using (public.is_shonaverse_member() and (user_id = auth.uid() or public.is_shonaverse_admin()));
create policy completions_add on public.lesson_completions for insert to authenticated
  with check (public.is_shonaverse_member() and user_id = auth.uid());
create policy completions_update on public.lesson_completions for update to authenticated
  using (public.is_shonaverse_member() and user_id = auth.uid())
  with check (public.is_shonaverse_member() and user_id = auth.uid());
create policy completions_delete on public.lesson_completions for delete to authenticated
  using (public.is_shonaverse_member() and (user_id = auth.uid() or public.is_shonaverse_admin()));

-- 6. the 'missions' image bucket: replace its old open policies with member-only upload -----
-- (the bucket stays public, so image links still show for everyone; this only controls uploads)
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%missions%'
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

create policy missions_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'missions' and public.is_shonaverse_member());
create policy missions_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'missions' and public.is_shonaverse_member() and (owner = auth.uid() or public.is_shonaverse_admin()));

commit;

-- Check afterwards (run separately): should list the policies above and nothing for anon/public.
-- select tablename, policyname, cmd, roles from pg_policies
--  where tablename in ('lesson_missions','lesson_mission_replies','lesson_completions') or schemaname='storage'
--  order by 1, 2;
