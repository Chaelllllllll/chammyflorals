create table public.email_verification_tokens (
  id bigserial not null,
  customer_id bigint not null,
  token text not null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone null default now(),
  constraint email_verification_tokens_pkey primary key (id),
  constraint email_verification_tokens_token_key unique (token),
  constraint email_verification_tokens_customer_id_fkey foreign KEY (customer_id) references customers (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_email_verification_tokens_token on public.email_verification_tokens using btree (token) TABLESPACE pg_default;

create index IF not exists idx_email_verification_tokens_customer on public.email_verification_tokens using btree (customer_id) TABLESPACE pg_default;