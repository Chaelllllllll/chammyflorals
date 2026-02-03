create table public.customer_messages (
  id bigserial not null,
  customer_id bigint not null,
  order_id text null,
  product_id bigint null,
  sender_type text not null,
  message text not null,
  image_url text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint customer_messages_pkey primary key (id),
  constraint customer_messages_customer_id_fkey foreign KEY (customer_id) references customers (id) on delete CASCADE,
  constraint customer_messages_order_id_fkey foreign KEY (order_id) references orders (order_id) on delete set null,
  constraint customer_messages_product_id_fkey foreign KEY (product_id) references products (id) on delete set null,
  constraint customer_messages_sender_type_check check (
    (
      sender_type = any (array['customer'::text, 'seller'::text])
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_customer_messages_customer_id on public.customer_messages using btree (customer_id) TABLESPACE pg_default;

create index IF not exists idx_customer_messages_order_id on public.customer_messages using btree (order_id) TABLESPACE pg_default;

create index IF not exists idx_customer_messages_product_id on public.customer_messages using btree (product_id) TABLESPACE pg_default;

create index IF not exists idx_customer_messages_created_at on public.customer_messages using btree (created_at desc) TABLESPACE pg_default;