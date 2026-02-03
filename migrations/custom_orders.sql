-- Custom Orders Table
-- Separate table for custom bouquet orders with detailed customization tracking

create table public.custom_orders (
  id uuid not null default extensions.uuid_generate_v4 (),
  order_id character varying(20) not null,
  customer_id bigint null,
  name character varying(255) not null,
  email character varying(255) not null,
  fb_link character varying(255) null,
  
  -- Customization details stored in JSONB for flexibility
  stems jsonb null,
  fillers jsonb null,
  wrapping jsonb null,
  addons jsonb null,
  
  special_instructions text null,
  total_fee numeric(10, 2) not null default 0.00,
  status character varying(50) null default 'Pending'::character varying,
  
  created_at timestamp without time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp without time zone null default CURRENT_TIMESTAMP,
  
  constraint custom_orders_pkey primary key (id),
  constraint custom_orders_order_id_key unique (order_id),
  constraint custom_orders_customer_id_fkey foreign key (customer_id) references customers (id) on delete set null
) tablespace pg_default;

-- Indexes for performance
create index if not exists idx_custom_orders_customer_id on public.custom_orders using btree (customer_id) tablespace pg_default;
create index if not exists idx_custom_orders_status on public.custom_orders using btree (status) tablespace pg_default;
create index if not exists idx_custom_orders_created_at on public.custom_orders using btree (created_at desc) tablespace pg_default;

-- Comments
comment on table public.custom_orders is 'Custom bouquet orders with detailed stem, filler, wrapping and addon selections';
comment on column public.custom_orders.stems is 'Array of selected stems with id, name, price, quantity';
comment on column public.custom_orders.fillers is 'Array of selected fillers with id, name, price, quantity';
comment on column public.custom_orders.wrapping is 'Selected wrapping option with id, name, price';
comment on column public.custom_orders.addons is 'Array of selected addons with id, name, price';
