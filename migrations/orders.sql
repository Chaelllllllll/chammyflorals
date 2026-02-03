create table public.orders (
  id uuid not null default extensions.uuid_generate_v4 (),
  order_id character varying(10) not null,
  name character varying(255) not null,
  email character varying(255) not null,
  fb_link character varying(255) null,
  flower_type character varying(255) not null,
  quantity integer not null,
  addons jsonb null,
  message text null,
  rush character varying(10) not null,
  total_fee numeric(10, 2) not null default 0.00,
  status character varying(50) null default 'Pending'::character varying,
  created_at timestamp without time zone null default CURRENT_TIMESTAMP,
  phone text null,
  items jsonb null,
  messenger_psid text null,
  messenger_subscribed_at timestamp with time zone null,
  customer_id bigint null,
  payment_method character varying null default ''::character varying,
  constraint orders_pkey primary key (id),
  constraint orders_order_id_key unique (order_id),
  constraint orders_customer_id_fkey foreign KEY (customer_id) references customers (id)
) TABLESPACE pg_default;

create index IF not exists idx_orders_customer_id on public.orders using btree (customer_id) TABLESPACE pg_default;