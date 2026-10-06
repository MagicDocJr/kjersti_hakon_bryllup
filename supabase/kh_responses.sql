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
  email        text not null check (char_length(email) <= 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
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
