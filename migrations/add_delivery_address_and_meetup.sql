-- Add delivery_address and preferred_meetup_place columns to orders and custom_orders tables

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS delivery_address text null,
ADD COLUMN IF NOT EXISTS preferred_meetup_place text null;

ALTER TABLE public.custom_orders 
ADD COLUMN IF NOT EXISTS delivery_address text null,
ADD COLUMN IF NOT EXISTS preferred_meetup_place text null;

COMMENT ON COLUMN public.orders.delivery_address IS 'Delivery address pinned from map or inputted by user';
COMMENT ON COLUMN public.orders.preferred_meetup_place IS 'Preferred meetup place if address is within Muntinlupa';

COMMENT ON COLUMN public.custom_orders.delivery_address IS 'Delivery address pinned from map or inputted by user';
COMMENT ON COLUMN public.custom_orders.preferred_meetup_place IS 'Preferred meetup place if address is within Muntinlupa';
