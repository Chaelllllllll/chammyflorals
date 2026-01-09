const passport = require('passport');

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const supabase = require('./supabase');
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    done(null, data);
  } catch (err) {
    done(err, null);
  }
});

console.log('✓ Passport configured (manual authentication only)');

module.exports = passport;

