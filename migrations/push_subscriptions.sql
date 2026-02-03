create table public.push_subscriptions (
  id uuid not null default gen_random_uuid (),
  endpoint text null,
  subscription jsonb not null,
  user_type text null,
  user_id text null,
  email text null,
  phone text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint push_subscriptions_pkey primary key (id),
  constraint push_subscriptions_endpoint_key unique (endpoint)
) TABLESPACE pg_default;

create index IF not exists idx_push_subscriptions_user on public.push_subscriptions using btree (user_id) TABLESPACE pg_default;