create table public.password_reset_tokens (
  id bigserial not null,
  customer_id bigint not null,
  token text not null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone null default now(),
  constraint password_reset_tokens_pkey primary key (id),
  constraint password_reset_tokens_token_key unique (token),
  constraint password_reset_tokens_customer_id_fkey foreign KEY (customer_id) references customers (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_password_reset_tokens_token on public.password_reset_tokens using btree (token) TABLESPACE pg_default;

create index IF not exists idx_password_reset_tokens_customer on public.password_reset_tokens using btree (customer_id) TABLESPACE pg_default;

create trigger cleanup_expired_tokens
after INSERT on password_reset_tokens for EACH STATEMENT
execute FUNCTION delete_expired_reset_tokens ();