const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Prefer the service role key on the server for admin operations (storage uploads, bucket management).
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('CRITICAL: Supabase configuration missing!');
  console.error('SUPABASE_URL:', SUPABASE_URL ? 'SET' : 'MISSING');
  console.error('SUPABASE_KEY:', SUPABASE_KEY ? 'SET' : 'MISSING');
  throw new Error('Supabase configuration is required. Please set SUPABASE_URL and SUPABASE_KEY environment variables.');
}

console.log('Supabase initialized successfully');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = supabase;