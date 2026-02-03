create table public.order_chats (
  id bigserial not null,
  order_id character varying(20) not null,
  sender_type character varying(10) not null,
  message text not null,
  created_at timestamp with time zone null default now(),
  constraint order_chats_pkey primary key (id),
  constraint fk_order foreign KEY (order_id) references orders (order_id) on delete CASCADE,
  constraint order_chats_sender_type_check check (
    (
      (sender_type)::text = any (
        (
          array[
            'customer'::character varying,
            'admin'::character varying
          ]
        )::text[]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_order_chats_order_id on public.order_chats using btree (order_id) TABLESPACE pg_default;

create index IF not exists idx_order_chats_created_at on public.order_chats using btree (created_at) TABLESPACE pg_default;