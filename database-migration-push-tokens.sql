-- Create user_push_tokens table for storing Expo push notification tokens
CREATE TABLE IF NOT EXISTS user_push_tokens (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(50),
  email VARCHAR(255),
  expo_push_token TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(phone, email)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_phone ON user_push_tokens(phone);
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_email ON user_push_tokens(email);

-- Add comments
COMMENT ON TABLE user_push_tokens IS 'Stores Expo push notification tokens for mobile app users';
COMMENT ON COLUMN user_push_tokens.phone IS 'User phone number (from order)';
COMMENT ON COLUMN user_push_tokens.email IS 'User email (from order)';
COMMENT ON COLUMN user_push_tokens.expo_push_token IS 'Expo push token for sending notifications';
