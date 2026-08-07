-- Insert custom_order_status setting if not present
INSERT INTO public.settings (setting_key, setting_value, description)
VALUES ('custom_order_status', 'open', 'Status of Custom bouquet ordering (open/closed)')
ON CONFLICT (setting_key) DO NOTHING;
