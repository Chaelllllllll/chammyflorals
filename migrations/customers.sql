create table public.customers (
  id bigserial not null,
  email text not null,
  password_hash text not null,
  name text not null,
  profile_picture text null,
  email_verified boolean null default false,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  last_login timestamp with time zone null,
  google_id text null,
  constraint customers_pkey primary key (id),
  constraint customers_email_key unique (email)
) TABLESPACE pg_default;

create index IF not exists idx_customers_email on public.customers using btree (email) TABLESPACE pg_default;

create unique INDEX IF not exists idx_customers_google_id on public.customers using btree (google_id) TABLESPACE pg_default
where
  (google_id is not null);