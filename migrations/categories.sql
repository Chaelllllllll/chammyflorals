create table public.categories (
  id serial not null,
  name text not null,
  slug text not null,
  created_at timestamp with time zone null default now(),
  rush_fee numeric(10, 2) not null default 0,
  constraint categories_pkey primary key (id),
  constraint categories_name_key unique (name),
  constraint categories_slug_key unique (slug)
) TABLESPACE pg_default;

create index IF not exists idx_categories_slug on public.categories using btree (slug) TABLESPACE pg_default;