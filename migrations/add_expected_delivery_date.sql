-- Add expected_delivery_date column to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS expected_delivery_date DATE;

-- Add expected_delivery_date column to custom_orders table
ALTER TABLE custom_orders
ADD COLUMN IF NOT EXISTS expected_delivery_date DATE;

-- Add rush column to custom_orders table
ALTER TABLE custom_orders
ADD COLUMN IF NOT EXISTS rush VARCHAR(10) DEFAULT 'No';

-- Create index for faster queries on delivery dates
CREATE INDEX IF NOT EXISTS idx_orders_expected_delivery_date ON orders(expected_delivery_date);
CREATE INDEX IF NOT EXISTS idx_custom_orders_expected_delivery_date ON custom_orders(expected_delivery_date);
