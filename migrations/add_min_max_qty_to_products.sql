-- Add min_qty / max_qty columns to public.products table
-- min_qty: minimum quantity the customer must select for this product (defaults to 1)
-- max_qty: maximum quantity the customer can select for this product (NULL = unlimited)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_qty integer DEFAULT 1;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS max_qty integer DEFAULT NULL;

COMMENT ON COLUMN public.products.min_qty IS 'Minimum quantity the customer must select for this product (e.g. minimum stems for a bouquet)';
COMMENT ON COLUMN public.products.max_qty IS 'Maximum quantity the customer can select for this product (NULL = unlimited)';
