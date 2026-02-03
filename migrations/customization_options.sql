-- Customization Options Tables for Custom Order Feature
-- This migration creates tables for stems, fillers, wrapping, and custom add-ons

-- Stems table
create table public.custom_stems (
  id bigint generated always as identity not null,
  name text not null,
  price numeric(10, 2) not null default 0.00,
  image_url text null,
  is_active boolean not null default true,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint custom_stems_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists idx_custom_stems_active on public.custom_stems using btree (is_active) TABLESPACE pg_default;

-- Fillers table
create table public.custom_fillers (
  id bigint generated always as identity not null,
  name text not null,
  price numeric(10, 2) not null default 0.00,
  image_url text null,
  is_active boolean not null default true,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint custom_fillers_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists idx_custom_fillers_active on public.custom_fillers using btree (is_active) TABLESPACE pg_default;

-- Wrapping table
create table public.custom_wrapping (
  id bigint generated always as identity not null,
  name text not null,
  price numeric(10, 2) not null default 0.00,
  image_url text null,
  is_active boolean not null default true,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint custom_wrapping_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists idx_custom_wrapping_active on public.custom_wrapping using btree (is_active) TABLESPACE pg_default;

-- Custom Add-ons table (separate from product add-ons for custom orders)
create table public.custom_addons (
  id bigint generated always as identity not null,
  name text not null,
  price numeric(10, 2) not null default 0.00,
  image_url text null,
  is_active boolean not null default true,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint custom_addons_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists idx_custom_addons_active on public.custom_addons using btree (is_active) TABLESPACE pg_default;

-- Add order_type column to orders table to distinguish regular orders from custom orders
-- Run this ALTER statement separately if orders table already exists
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_type character varying(20) null default 'regular';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS custom_details jsonb null;

-- The custom_details JSONB column will store:
-- {
--   "stems": [{ "id": 1, "name": "Rose Stem", "price": 50, "quantity": 3 }],
--   "fillers": [{ "id": 2, "name": "Baby's Breath", "price": 30, "quantity": 2 }],
--   "wrapping": { "id": 1, "name": "Korean Wrap", "price": 20 },
--   "addons": [{ "id": 1, "name": "Ribbon", "price": 15 }]
-- }

create index IF not exists idx_orders_order_type on public.orders using btree (order_type) TABLESPACE pg_default;
