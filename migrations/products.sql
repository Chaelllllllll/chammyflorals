create table public.products (
  id bigint generated always as identity not null,
  name text not null,
  image_url text null,
  image_path text null,
  created_at timestamp with time zone null default now(),
  image_data text null,
  pricing jsonb null,
  addons jsonb null,
  category text null,
  colors jsonb null,
  images jsonb null,
  images_paths text[] null,
  constraint products_pkey primary key (id)
) TABLESPACE pg_default;