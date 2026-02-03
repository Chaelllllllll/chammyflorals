create table public.announcements (
  id uuid not null default gen_random_uuid (),
  title text not null,
  description text not null,
  image_url text null,
  link_url text null,
  link_text text null default 'Learn More'::text,
  type text null default 'general'::text,
  is_active boolean null default true,
  start_date timestamp with time zone null default now(),
  end_date timestamp with time zone null,
  created_by uuid null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint announcements_pkey primary key (id),
  constraint announcements_created_by_fkey foreign KEY (created_by) references admins (id),
  constraint announcements_type_check check (
    (
      type = any (
        array[
          'general'::text,
          'sale'::text,
          'new_product'::text,
          'event'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_announcements_active on public.announcements using btree (is_active, start_date, end_date) TABLESPACE pg_default;