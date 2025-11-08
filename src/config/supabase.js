const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Prefer the service role key on the server for admin operations (storage uploads, bucket management).
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('Supabase: SUPABASE_URL or SUPABASE_KEY (or SUPABASE_SERVICE_ROLE_KEY) is not set. Some operations may fail.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = supabase;