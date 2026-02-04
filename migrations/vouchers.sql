-- Vouchers Table
-- Manages discount vouchers with eligibility criteria and usage tracking

create table public.vouchers (
  id uuid not null default extensions.uuid_generate_v4(),
  code character varying(50) not null,
  description text null,
  
  -- Discount configuration
  discount_type character varying(20) not null default 'percentage', -- 'percentage' or 'fixed'
  discount_value numeric(10, 2) not null,
  max_discount_amount numeric(10, 2) null, -- For percentage discounts, cap the maximum discount
  
  -- Eligibility criteria
  min_order_amount numeric(10, 2) null default 0.00,
  max_uses integer null, -- null = unlimited
  uses_per_customer integer null default 1,
  eligible_customer_type character varying(20) null, -- 'all', 'new', 'returning'
  
  -- Validity period
  valid_from timestamp without time zone null default CURRENT_TIMESTAMP,
  valid_until timestamp without time zone null,
  
  -- Status
  is_active boolean not null default true,
  
  -- Metadata
  created_at timestamp without time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp without time zone null default CURRENT_TIMESTAMP,
  created_by character varying(255) null,
  
  constraint vouchers_pkey primary key (id),
  constraint vouchers_code_key unique (code),
  constraint vouchers_discount_type_check check (discount_type in ('percentage', 'fixed')),
  constraint vouchers_eligible_customer_type_check check (eligible_customer_type in ('all', 'new', 'returning') or eligible_customer_type is null)
) tablespace pg_default;

-- Voucher Usage Tracking Table
create table public.voucher_usage (
  id uuid not null default extensions.uuid_generate_v4(),
  voucher_id uuid not null,
  order_id character varying(20) not null,
  customer_id bigint null,
  customer_email character varying(255) not null,
  discount_amount numeric(10, 2) not null,
  used_at timestamp without time zone null default CURRENT_TIMESTAMP,
  
  constraint voucher_usage_pkey primary key (id),
  constraint voucher_usage_voucher_id_fkey foreign key (voucher_id) references vouchers (id) on delete cascade,
  constraint voucher_usage_customer_id_fkey foreign key (customer_id) references customers (id) on delete set null
) tablespace pg_default;

-- Indexes for performance
create index if not exists idx_vouchers_code on public.vouchers using btree (code) tablespace pg_default;
create index if not exists idx_vouchers_is_active on public.vouchers using btree (is_active) tablespace pg_default;
create index if not exists idx_vouchers_valid_until on public.vouchers using btree (valid_until) tablespace pg_default;
create index if not exists idx_voucher_usage_voucher_id on public.voucher_usage using btree (voucher_id) tablespace pg_default;
create index if not exists idx_voucher_usage_customer_email on public.voucher_usage using btree (customer_email) tablespace pg_default;
create index if not exists idx_voucher_usage_order_id on public.voucher_usage using btree (order_id) tablespace pg_default;

-- Comments
comment on table public.vouchers is 'Discount vouchers with eligibility criteria';
comment on column public.vouchers.discount_type is 'Type of discount: percentage or fixed amount';
comment on column public.vouchers.discount_value is 'Discount percentage (e.g., 10 for 10%) or fixed amount';
comment on column public.vouchers.max_discount_amount is 'Maximum discount for percentage type';
comment on column public.vouchers.min_order_amount is 'Minimum order amount required to use voucher';
comment on column public.vouchers.max_uses is 'Maximum total uses across all customers (null = unlimited)';
comment on column public.vouchers.uses_per_customer is 'Maximum uses per customer';
comment on column public.vouchers.eligible_customer_type is 'Customer eligibility: all, new, or returning';

comment on table public.voucher_usage is 'Tracks voucher usage per order';
