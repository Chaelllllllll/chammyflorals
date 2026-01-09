const { createClient } = require('@supabase/supabase-js');

// Note: dotenv is loaded in api/index.js before this module is required
// On Vercel, environment variables are automatically available from dashboard settings

console.log('Initializing Supabase client...');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'MISSING');
console.log('SUPABASE_KEY:', process.env.SUPABASE_KEY ? 'SET (length: ' + (process.env.SUPABASE_KEY?.length || 0) + ')' : 'MISSING');

// Prefer the service role key on the server for admin operations (storage uploads, bucket management).
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('========================================');
  console.error('CRITICAL: Supabase configuration missing!');
  console.error('SUPABASE_URL:', SUPABASE_URL ? 'SET' : 'MISSING');
  console.error('SUPABASE_KEY:', SUPABASE_KEY ? 'SET' : 'MISSING');
  console.error('All env vars:', Object.keys(process.env).join(', '));
  console.error('========================================');
  throw new Error('Supabase configuration is required. Please set SUPABASE_URL and SUPABASE_KEY in Vercel environment variables.');
}

console.log('✓ Supabase client initialized successfully');
console.log('URL:', SUPABASE_URL);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = supabase;