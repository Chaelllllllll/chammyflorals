create table public.user_push_tokens (
  id serial not null,
  phone character varying(50) null,
  email character varying(255) null,
  expo_push_token text not null,
  created_at timestamp without time zone null default now(),
  updated_at timestamp without time zone null default now(),
  constraint user_push_tokens_pkey primary key (id),
  constraint user_push_tokens_phone_email_key unique (phone, email)
) TABLESPACE pg_default;

create index IF not exists idx_user_push_tokens_phone on public.user_push_tokens using btree (phone) TABLESPACE pg_default;

create index IF not exists idx_user_push_tokens_email on public.user_push_tokens using btree (email) TABLESPACE pg_default;

create index IF not exists idx_user_push_tokens_token on public.user_push_tokens using btree (expo_push_token) TABLESPACE pg_default;