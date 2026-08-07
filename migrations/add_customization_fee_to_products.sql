-- Add customization_fee column to public.products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS customization_fee numeric DEFAULT 0;

COMMENT ON COLUMN public.products.customization_fee IS 'Customization fee added to the base custom order total fee if this product is customized';
