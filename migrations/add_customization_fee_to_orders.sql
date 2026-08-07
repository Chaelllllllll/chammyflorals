-- Add customization_fee column to public.orders table
-- Stores the flat one-time customization fee applied to this order (0 when none)
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS customization_fee numeric(10, 2) DEFAULT 0;

COMMENT ON COLUMN public.orders.customization_fee IS 'Flat one-time customization fee applied to this order (0 when none)';
