const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const supabase = require('./supabase');
const crypto = require('crypto');

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
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

// Google Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
    passReqToCallback: true
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      console.log('Google profile:', profile);
      
      const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
      const googleId = profile.id;
      const name = profile.displayName;
      const picture = profile.photos && profile.photos[0] ? profile.photos[0].value : null;
      
      if (!email) {
        return done(new Error('Email is required from Google'), null);
      }

      // Check if user already exists by email
      const { data: existingUser, error: selectError } = await supabase
        .from('customers')
        .select('*')
        .eq('email', email)
        .single();

      if (existingUser) {
        // User exists - update google info and last login
        const { data: updatedUser, error: updateError } = await supabase
          .from('customers')
          .update({
            google_id: googleId,
            profile_picture: picture,
            last_login: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', existingUser.id)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating user:', updateError);
          return done(updateError, null);
        }

        return done(null, updatedUser);
      }

      // User doesn't exist - create new account
      // Generate a random password for Google users (they won't use it)
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash(randomPassword, 10);

      const { data: newUser, error: insertError } = await supabase
        .from('customers')
        .insert([{
          email: email,
          name: name,
          password_hash: passwordHash, // Random password (user won't use it)
          google_id: googleId,
          profile_picture: picture,
          email_verified: true, // Google emails are verified
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_login: new Date().toISOString()
        }])
        .select()
        .single();

      if (insertError) {
        console.error('Error creating user:', insertError);
        return done(insertError, null);
      }

      return done(null, newUser);
    } catch (error) {
      console.error('Google auth error:', error);
      return done(error, null);
    }
  }
));

module.exports = passport;
