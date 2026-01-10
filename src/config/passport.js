const passport = require('passport');

// Serialize user for session
passport.serializeUser((user, done) => {
  // Store a primitive identifier in the session (id or email token).
  done(null, user && user.id ? user.id : user);
});

// Deserialize user from session. Try admins first, then customers.
passport.deserializeUser(async (id, done) => {
  try {
    const supabase = require('./supabase');

    // If id is falsy, short-circuit
    if (!id) return done(null, null);

    // Try admins table first (admin sessions). Use try/catch to avoid throwing
    // on not-found; Supabase returns an error when single() does not find a row.
    try {
      const { data: adminData, error: adminErr } = await supabase
        .from('admins')
        .select('*')
        .eq('id', id)
        .limit(1)
        .single();
      if (!adminErr && adminData) return done(null, adminData);
    } catch (e) {
      // ignore and fall through to customers
    }

    // Fall back to customers table
    try {
      const { data: customerData, error: custErr } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .limit(1)
        .single();
      if (!custErr && customerData) return done(null, customerData);
    } catch (e) {
      // ignore
    }

    // No matching user found
    return done(null, null);
  } catch (err) {
    return done(err, null);
  }
});

console.log('✓ Passport configured (manual authentication only)');

module.exports = passport;

