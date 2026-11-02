-- RSVP table for Kjersti & Håkon, living in the same Supabase project as
-- Ragnhild & Vetle (bevrttmvumfodpkauiio). Both sites share the public anon
-- key, so isolation comes from privileges + RLS:
--   * anon may INSERT rows and nothing else (no SELECT, UPDATE, DELETE)
--   * replies are read in the dashboard or with the service_role key
-- Applied 2026-10-06.

create table if not exists public.kh_responses (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  household_id uuid not null,              -- groups guests sent in one form
  first_name   text not null check (char_length(first_name) between 1 and 100),
  last_name    text not null check (char_length(last_name) between 1 and 100),
  email        text check (char_length(email) <= 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  attending    boolean not null,
  stay         boolean,                     -- overnight at Malungen; null when not attending
  allergies    text check (char_length(allergies) <= 1000),
  message      text check (char_length(message) <= 2000),
  constraint kh_stay_only_if_attending check (attending or stay is null)
);

create index if not exists kh_responses_household_idx on public.kh_responses (household_id);

alter table public.kh_responses enable row level security;

-- Supabase grants everything on new public tables to anon/authenticated by
-- default. Take it all back and hand anon only INSERT.
revoke all on public.kh_responses from anon, authenticated;
grant insert on public.kh_responses to anon;

drop policy if exists "kh anon insert" on public.kh_responses;
create policy "kh anon insert" on public.kh_responses
  for insert to anon with check (true);

-- 2026-11-02: "have you paid for lodging?" and a live guest overview.
--   * paid_lodging: the guest's own yes/no, asked when someone stays over
--   * the couple log in on /oversikt/ as kjerstioghakon@gmail.com (an auth
--     user created by an admin; nobody else can claim that address) and may
--     SELECT every row. Other authenticated users still see nothing.
--   * kh_responses is in the realtime publication, so new replies appear
--     without reloading. Realtime applies the same RLS.

alter table public.kh_responses add column if not exists paid_lodging boolean;
alter table public.kh_responses drop constraint if exists kh_paid_only_if_stay;
alter table public.kh_responses add constraint kh_paid_only_if_stay check (stay or paid_lodging is null);

grant select on public.kh_responses to authenticated;

drop policy if exists "kh couple read" on public.kh_responses;
create policy "kh couple read" on public.kh_responses
  for select to authenticated
  using ((select auth.jwt() ->> 'email') = 'kjerstioghakon@gmail.com');

do $$ begin
  alter publication supabase_realtime add table public.kh_responses;
exception when duplicate_object then null;
end $$;

-- 2026-11-02: keep-alive. Free projects pause after about a week without
-- traffic, which breaks the RSVP form. .github/workflows/keepalive.yml calls
-- this every few days with the public key. It reads nothing.
create or replace function public.kh_ping() returns timestamptz
  language sql stable as $$ select now() $$;
revoke all on function public.kh_ping() from public;
grant execute on function public.kh_ping() to anon;

-- 2026-11-02: e-post er valgfri i skjemaet (parets dokument ber ikke om den).
alter table public.kh_responses alter column email drop not null;

-- 2026-11-03: the couple can correct who has paid for lodging from
-- /oversikt/. Only the logged-in kjerstioghakon@gmail.com user, and only
-- these two columns; paid_checked_at records when they confirmed it.
alter table public.kh_responses add column if not exists paid_checked_at timestamptz;
grant update (paid_lodging, paid_checked_at) on public.kh_responses to authenticated;
drop policy if exists "kh couple update paid" on public.kh_responses;
create policy "kh couple update paid" on public.kh_responses
  for update to authenticated
  using ((select auth.jwt() ->> 'email') = 'kjerstioghakon@gmail.com')
  with check ((select auth.jwt() ->> 'email') = 'kjerstioghakon@gmail.com');
notify pgrst, 'reload schema';
