-- Add voucher fields to orders and custom_orders tables

-- Add voucher columns to orders table
alter table public.orders
  add column if not exists voucher_code character varying(50),
  add column if not exists voucher_discount numeric(10, 2) default 0.00,
  add column if not exists original_total numeric(10, 2);

-- Add voucher columns to custom_orders table
alter table public.custom_orders
  add column if not exists voucher_code character varying(50),
  add column if not exists voucher_discount numeric(10, 2) default 0.00,
  add column if not exists original_total numeric(10, 2);

-- Indexes for voucher lookups
create index if not exists idx_orders_voucher_code on public.orders using btree (voucher_code) tablespace pg_default;
create index if not exists idx_custom_orders_voucher_code on public.custom_orders using btree (voucher_code) tablespace pg_default;

-- Comments
comment on column public.orders.voucher_code is 'Voucher code applied to this order';
comment on column public.orders.voucher_discount is 'Discount amount from voucher';
comment on column public.orders.original_total is 'Total before voucher discount';

comment on column public.custom_orders.voucher_code is 'Voucher code applied to this order';
comment on column public.custom_orders.voucher_discount is 'Discount amount from voucher';
comment on column public.custom_orders.original_total is 'Total before voucher discount';
