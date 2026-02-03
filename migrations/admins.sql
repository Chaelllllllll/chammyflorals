create table public.admins (
  id uuid not null default extensions.uuid_generate_v4 (),
  psid text null,
  name text null,
  email character varying(255) null,
  password_hash character varying(1024) null,
  status text null default 'Not Approved'::text,
  created_at timestamp with time zone not null default now(),
  approved_at timestamp with time zone null,
  last_seen timestamp with time zone null,
  twofa_code text null,
  twofa_expires text null,
  twofa_token text null,
  session_token text null,
  session_expires timestamp with time zone null,
  totp_secret text null,
  totp_enabled boolean null default false,
  constraint admins_pkey primary key (id),
  constraint admins_email_key unique (email),
  constraint admins_psid_key unique (psid)
) TABLESPACE pg_default;

create index IF not exists idx_admins_status on public.admins using btree (status) TABLESPACE pg_default;

create index IF not exists idx_admins_psid on public.admins using btree (psid) TABLESPACE pg_default;