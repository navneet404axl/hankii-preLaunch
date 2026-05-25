create table if not exists public.waitlist_signups (
  id bigint generated always as identity primary key,
  email text not null unique,
  source text not null check (source in ('hero', 'waitlist', 'final')),
  marketing_consent boolean not null check (marketing_consent = true),
  created_at timestamptz not null default now(),
  constraint normalized_email check (email = lower(btrim(email))),
  constraint reasonable_email check (
    length(email) <= 254
    and email ~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)+$'
  )
);

alter table public.waitlist_signups enable row level security;

-- No anon/authenticated policies are created. Signups must go through the
-- Edge Function, which uses the private database secret after bot verification.
revoke all on table public.waitlist_signups from anon, authenticated;
revoke all on sequence public.waitlist_signups_id_seq from anon, authenticated;

grant insert, select on table public.waitlist_signups to service_role;
grant usage, select on sequence public.waitlist_signups_id_seq to service_role;
