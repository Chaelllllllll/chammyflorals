const express = require('express');
const passport = require('../config/passport');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Check if Google OAuth is configured
const isGoogleConfigured = () => {
  return process.env.GOOGLE_CLIENT_ID && 
         process.env.GOOGLE_CLIENT_SECRET;
};

// Initiate Google authentication
router.get('/google', (req, res, next) => {
  if (!isGoogleConfigured()) {
    return res.status(503).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Sign-In Not Configured</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .container {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 20px;
            max-width: 500px;
          }
          .error-icon {
            font-size: 48px;
            color: #ff6b6b;
            margin-bottom: 20px;
          }
          h2 { color: #333; }
          p { color: #666; line-height: 1.6; }
          .btn {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 24px;
            background: #4285f4;
            color: white;
            text-decoration: none;
            border-radius: 8px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error-icon">⚙️</div>
          <h2>Google Sign-In Not Configured</h2>
          <p>The administrator needs to configure Google OAuth credentials.</p>
          <p>Please add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to the .env file.</p>
          <a href="/customer-login.html" class="btn">Back to Login</a>
        </div>
      </body>
      </html>
    `);
  }
  
  passport.authenticate('google', { 
    scope: ['profile', 'email'] 
  })(req, res, next);
});


// Google callback route
router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: '/customer-login.html?error=google_auth_failed',
    session: false // We use JWT, not sessions
  }),
  (req, res, next) => {
    try {
      // User authenticated successfully
      const user = req.user;
      
      console.log('=== Google Callback ===');
      console.log('User object:', user);
      
      if (!user) {
        console.error('No user returned from Google authentication');
        return res.redirect('/customer-login.html?error=no_user_data');
      }
      
      // Generate JWT token
      const token = jwt.sign(
        { 
          customerId: user.id, 
          email: user.email,
          type: 'customer'
        },
        process.env.CUSTOMER_JWT_SECRET || 'customer-secret-key-change-in-production',
        { expiresIn: '30d' }
      );

      console.log('Token generated:', token.substring(0, 20) + '...');
      console.log('User ID:', user.id);
      console.log('User Email:', user.email);

      // Encode user data for URL parameter
      const userData = encodeURIComponent(JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        profile_picture: user.profile_picture
      }));

      console.log('Redirecting to auth-success.html');
      
      // Redirect to success page that will handle token storage
      res.redirect(`/auth-success.html?token=${token}&user=${userData}`);
    } catch (error) {
      console.error('Error in Google callback:', error);
      res.redirect('/customer-login.html?error=auth_processing_failed');
    }
  }
);

// Logout route
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.redirect('/index.html');
  });
});

module.exports = router;
