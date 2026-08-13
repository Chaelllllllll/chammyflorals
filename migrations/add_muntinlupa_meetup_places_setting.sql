-- Insert default Muntinlupa meetup places setting
INSERT INTO settings (setting_key, setting_value, description)
VALUES (
    'muntinlupa_meetup_places',
    '["Alabang Town Center", "Festival Mall", "SM Center Muntinlupa", "Starmall Alabang"]',
    'List of preferred meetup places for Muntinlupa deliveries'
)
ON CONFLICT (setting_key) DO NOTHING;
