create table public.product_notifications (
  id uuid not null default gen_random_uuid (),
  product_id bigint null,
  customer_id bigint null,
  is_read boolean null default false,
  created_at timestamp with time zone null default now(),
  constraint product_notifications_pkey primary key (id),
  constraint product_notifications_product_id_customer_id_key unique (product_id, customer_id),
  constraint product_notifications_customer_id_fkey foreign KEY (customer_id) references customers (id) on delete CASCADE,
  constraint product_notifications_product_id_fkey foreign KEY (product_id) references products (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_product_notifications_unread on public.product_notifications using btree (customer_id, is_read) TABLESPACE pg_default;