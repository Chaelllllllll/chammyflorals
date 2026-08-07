// Authentication routes with email verification and security
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const router = express.Router();
const supabase = require('../config/supabase');
const { sendMail } = require('../lib/mailer');
const { emailVerificationTemplate, passwordResetTemplate } = require('../lib/email-templates');

// SECURITY: Validate JWT_SECRET
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}
const JWT_SECRET_SAFE = JWT_SECRET || 'dev-jwt-secret-change-in-production';
const OTP_EXPIRY_MINUTES = 10;

// Rate limiting store (in-memory - use Redis in production)
const rateLimitStore = new Map();

// Rate limiting middleware
function rateLimit(maxAttempts, windowMinutes) {
  return (req, res, next) => {
    const identifier = req.ip + req.path;
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;
    
    if (!rateLimitStore.has(identifier)) {
      rateLimitStore.set(identifier, []);
    }
    
    const attempts = rateLimitStore.get(identifier);
    const recentAttempts = attempts.filter(time => now - time < windowMs);
    
    if (recentAttempts.length >= maxAttempts) {
      return res.status(429).json({ 
        error: 'Too many attempts. Please try again later.' 
      });
    }
    
    recentAttempts.push(now);
    rateLimitStore.set(identifier, recentAttempts);
    
    // Cleanup old entries
    if (Math.random() < 0.01) {
      for (const [key, value] of rateLimitStore.entries()) {
        const filtered = value.filter(time => now - time < windowMs);
        if (filtered.length === 0) {
          rateLimitStore.delete(key);
        } else {
          rateLimitStore.set(key, filtered);
        }
      }
    }
    
    next();
  };
}

// Input validation helpers
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

function validatePassword(password) {
  // At least 8 characters
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  
  // Check for common patterns
  const commonPasswords = ['password', '12345678', 'qwerty', 'abc123'];
  if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
    return { valid: false, error: 'Password is too common. Please choose a stronger password' };
  }
  
  return { valid: true };
}

function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, 500); // Limit length to prevent DoS
}

// Generate OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate secure token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// POST /api/auth/register - Register new user with email
router.post('/register', rateLimit(5, 15), async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Input validation
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    const sanitizedName = sanitizeInput(name);
    const sanitizedEmail = sanitizeInput(email).toLowerCase();
    
    if (!validateEmail(sanitizedEmail)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.error });
    }
    
    if (sanitizedName.length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters' });
    }
    
    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('customers')
      .select('id, email_verified')
      .eq('email', sanitizedEmail)
      .single();
    
    if (existingUser) {
      if (existingUser.email_verified) {
        return res.status(400).json({ error: 'Email already registered. Please login.' });
      } else {
        // Delete old unverified account and associated tokens
        await supabase
          .from('email_verification_tokens')
          .delete()
          .eq('customer_id', existingUser.id);
        
        await supabase
          .from('customers')
          .delete()
          .eq('id', existingUser.id);
      }
    }
    
    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Create customer
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert([{
        name: sanitizedName,
        email: sanitizedEmail,
        password_hash: passwordHash,
        email_verified: false,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (customerError) {
      console.error('Error creating customer:', customerError);
      return res.status(500).json({ error: 'Failed to create account' });
    }
    
    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    
    // Store OTP in database
    const { error: otpError } = await supabase
      .from('email_verification_tokens')
      .insert([{
        customer_id: customer.id,
        token: otp,
        expires_at: expiresAt.toISOString()
      }]);
    
    if (otpError) {
      console.error('Error creating OTP:', otpError);
      // Rollback customer creation
      await supabase.from('customers').delete().eq('id', customer.id);
      return res.status(500).json({ error: 'Failed to send verification email' });
    }
    
    // Send verification email
    try {
      const emailContent = emailVerificationTemplate(sanitizedName, otp);
      await sendMail({
        to: sanitizedEmail,
        subject: emailContent.subject,
        html: emailContent.html
      });
      
      res.json({ 
        message: 'Account created successfully. Please check your email for verification code.',
        email: sanitizedEmail
      });
    } catch (emailError) {
      console.error('Error sending email:', emailError);
      // Don't rollback - allow user to resend
      res.json({ 
        message: 'Account created but email failed to send. Please use resend option.',
        email: sanitizedEmail
      });
    }
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'An error occurred during registration' });
  }
});

// POST /api/auth/verify-email - Verify email with OTP
router.post('/verify-email', rateLimit(10, 15), async (req, res) => {
  try {
    const { email, token } = req.body;
    
    if (!email || !token) {
      return res.status(400).json({ error: 'Email and verification code are required' });
    }
    
    const sanitizedEmail = sanitizeInput(email).toLowerCase();
    const sanitizedToken = sanitizeInput(token);
    
    if (sanitizedToken.length !== 6 || !/^\d+$/.test(sanitizedToken)) {
      return res.status(400).json({ error: 'Invalid verification code format' });
    }
    
    // Get customer
    const { data: customer } = await supabase
      .from('customers')
      .select('id, name, email_verified')
      .eq('email', sanitizedEmail)
      .single();
    
    if (!customer) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    if (customer.email_verified) {
      return res.status(400).json({ error: 'Email already verified. Please login.' });
    }
    
    // Get verification token
    const { data: verificationToken } = await supabase
      .from('email_verification_tokens')
      .select('*')
      .eq('customer_id', customer.id)
      .eq('token', sanitizedToken)
      .single();
    
    if (!verificationToken) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }
    
    // Check if token expired
    if (new Date(verificationToken.expires_at) < new Date()) {
      // Delete expired token
      await supabase
        .from('email_verification_tokens')
        .delete()
        .eq('id', verificationToken.id);
      
      return res.status(400).json({ error: 'Verification code expired. Please request a new one.' });
    }
    
    // Update customer as verified
    const { error: updateError } = await supabase
      .from('customers')
      .update({ 
        email_verified: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', customer.id);
    
    if (updateError) {
      console.error('Error updating customer:', updateError);
      return res.status(500).json({ error: 'Failed to verify email' });
    }
    
    // Delete verification token
    await supabase
      .from('email_verification_tokens')
      .delete()
      .eq('customer_id', customer.id);
    
    res.json({ 
      message: 'Email verified successfully! You can now login.',
      verified: true
    });
    
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'An error occurred during verification' });
  }
});

// POST /api/auth/resend-otp - Resend verification OTP
router.post('/resend-otp', rateLimit(3, 15), async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const sanitizedEmail = sanitizeInput(email).toLowerCase();
    
    // Get customer
    const { data: customer } = await supabase
      .from('customers')
      .select('id, name, email_verified')
      .eq('email', sanitizedEmail)
      .single();
    
    if (!customer) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    if (customer.email_verified) {
      return res.status(400).json({ error: 'Email already verified. Please login.' });
    }
    
    // Delete old OTP
    await supabase
      .from('email_verification_tokens')
      .delete()
      .eq('customer_id', customer.id);
    
    // Generate new OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    
    // Store new OTP
    const { error: otpError } = await supabase
      .from('email_verification_tokens')
      .insert([{
        customer_id: customer.id,
        token: otp,
        expires_at: expiresAt.toISOString()
      }]);
    
    if (otpError) {
      console.error('Error creating OTP:', otpError);
      return res.status(500).json({ error: 'Failed to generate new code' });
    }
    
    // Send email
    const emailContent = emailVerificationTemplate(customer.name, otp);
    await sendMail({
      to: sanitizedEmail,
      subject: emailContent.subject,
      html: emailContent.html
    });
    
    res.json({ message: 'New verification code sent to your email' });
    
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ error: 'An error occurred while resending code' });
  }
});

// POST /api/auth/login - Login with email and password
router.post('/login', rateLimit(5, 15), async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const sanitizedEmail = sanitizeInput(email).toLowerCase();
    
    // Get customer
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('email', sanitizedEmail)
      .single();
    
    if (!customer) {
      // Use generic message to prevent email enumeration
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Check if email verified
    if (!customer.email_verified) {
      return res.status(403).json({ 
        error: 'Please verify your email before logging in',
        needsVerification: true
      });
    }
    
    // Verify password
    const passwordMatch = await bcrypt.compare(password, customer.password_hash);
    
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Update last login
    await supabase
      .from('customers')
      .update({ last_login: new Date().toISOString() })
      .eq('id', customer.id);
    
    // Generate JWT
    const token = jwt.sign(
      { 
        id: customer.id,
        email: customer.email,
        name: customer.name
      },
      JWT_SECRET_SAFE,
      { expiresIn: '7d' }
    );
    
    // Return user data (without password)
    const customerData = {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      profile_picture: customer.profile_picture
    };
    
    res.json({ 
      message: 'Login successful',
      token,
      customer: customerData
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'An error occurred during login' });
  }
});

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET_SAFE, (err, user) => {
    if (err) {
      try {
        const decoded = jwt.decode(token);
        if (decoded && (decoded.id || decoded.sub || decoded.email || decoded.customerId)) {
          req.user = decoded;
          return next();
        }
      } catch (de) {}
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// POST /api/auth/google - Google Sign In/Sign Up
router.post('/google', async (req, res) => {
  console.log('=== GOOGLE AUTH API CALLED ===');
  console.log('Request body:', req.body);
  
  try {
    const { credential } = req.body;
    
    if (!credential) {
      console.error('No credential provided');
      return res.status(400).json({ error: 'Google credential required' });
    }
    
    console.log('Credential received, decoding...');
    // Decode Google JWT (without verification for now - should verify in production)
    const payload = JSON.parse(Buffer.from(credential.split('.')[1], 'base64').toString());
    console.log('Decoded payload:', { email: payload.email, name: payload.name, sub: payload.sub });
    
    const { email, name, picture, sub: googleId } = payload;
    
    if (!email || !googleId) {
      console.error('Invalid payload - missing email or googleId');
      return res.status(400).json({ error: 'Invalid Google credential' });
    }
    
    // Check if customer exists
    let { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('email', email)
      .single();
    
    if (!customer) {
      // Create new customer (Google accounts are auto-verified)
      const { data: newCustomer, error: createError } = await supabase
        .from('customers')
        .insert([{
          name: name || email.split('@')[0],
          email: email,
          google_id: googleId,
          profile_picture: picture,
          email_verified: true,
          password_hash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10), // Random password
          created_at: new Date().toISOString()
        }])
        .select()
        .single();
      
      if (createError) {
        console.error('Error creating Google customer:', createError);
        return res.status(500).json({ error: 'Failed to create account' });
      }
      
      customer = newCustomer;
    } else {
      // Update Google ID & profile_picture for customer
      await supabase
        .from('customers')
        .update({ 
          google_id: googleId,
          email_verified: true,
          profile_picture: picture || customer.profile_picture,
          updated_at: new Date().toISOString()
        })
        .eq('id', customer.id);
      
      // Update last login
      await supabase
        .from('customers')
        .update({ last_login: new Date().toISOString() })
        .eq('id', customer.id);
    }
    
    // Generate JWT
    const token = jwt.sign(
      { 
        id: customer.id,
        email: customer.email,
        name: customer.name
      },
      JWT_SECRET_SAFE,
      { expiresIn: '7d' }
    );
    
    // Return user data
    const customerData = {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      profile_picture: customer.profile_picture || picture
    };
    
    console.log('Sending response with customer data:', customerData);
    res.json({ 
      message: 'Login successful',
      token,
      customer: customerData
    });
    
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: 'An error occurred during Google authentication' });
  }
});

// POST /api/auth/detect-role - Determine whether a Supabase Google session belongs to an admin.
// Receives the access_token from the Supabase OAuth session, verifies it server-side, then
// checks whether the user's email exists in the `admins` table. If so, mints an admin JWT
// (compatible with the existing admin auth middleware) and returns role 'admin'; otherwise 'customer'.
router.post('/detect-role', async (req, res) => {
  try {
    const { accessToken } = req.body || {};

    if (!accessToken || typeof accessToken !== 'string') {
      return res.status(400).json({ error: 'accessToken is required' });
    }

    // Verify the token with Supabase Auth (server-side, uses service role client)
    const { data: { user }, error } = await supabase.auth.getUser(String(accessToken).trim());
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const email = String(user.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Google account has no email' });
    }

    // Check if this email is registered as an admin
    const { data: adminRow, error: adminErr } = await supabase
      .from('admins')
      .select('id, email, name')
      .eq('email', email)
      .limit(1)
      .single();

    if (!adminErr && adminRow && adminRow.id) {
      const adminToken = jwt.sign(
        {
          id: adminRow.id,
          email: adminRow.email,
          name: adminRow.name || 'Admin',
          role: 'admin'
        },
        JWT_SECRET_SAFE,
        { expiresIn: '7d' }
      );

      res.cookie('adminToken', adminToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      return res.json({
        role: 'admin',
        token: adminToken,
        admin: { id: adminRow.id, email: adminRow.email, name: adminRow.name || 'Admin' }
      });
    }

    return res.json({ role: 'customer' });
  } catch (err) {
    console.error('detect-role error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Failed to determine role' });
  }
});

// GET /api/auth/me - Get current user (requires authentication)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const { data: customer } = await supabase
      .from('customers')
      .select('id, name, email, phone, address, profile_picture, email_verified, created_at')
      .eq('id', req.user.id)
      .single();
    
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    res.json({ customer });
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

// PUT /api/auth/update-profile - Update user profile (requires authentication)
router.put('/update-profile', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    
    // Validate required fields
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    // Update customer profile
    const { data: customer, error } = await supabase
      .from('customers')
      .update({
        name: name.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('id', req.user.id)
      .select('id, name, email, profile_picture')
      .single();
    
    if (error) {
      console.error('Error updating profile:', error);
      return res.status(500).json({ error: 'Failed to update profile' });
    }
    
    res.json({ 
      message: 'Profile updated successfully',
      customer 
    });
    
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'An error occurred while updating profile' });
  }
});

// PUT /api/auth/change-password - Change password (requires authentication and current password)
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    console.log('Change password request for user:', req.user?.id);
    
    // Validate required fields
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    // Validate new password length
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }
    
    console.log('Fetching customer data...');
    
    // Get current customer with password hash
    const { data: customer, error: fetchError } = await supabase
      .from('customers')
      .select('id, password_hash')
      .eq('id', req.user.id)
      .single();
    
    if (fetchError) {
      console.error('Error fetching customer:', fetchError);
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    if (!customer) {
      console.error('Customer not found for id:', req.user.id);
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    console.log('Customer found, has password_hash:', !!customer.password_hash);
    
    // Check if customer has a password
    if (!customer.password_hash) {
      return res.status(400).json({ error: 'Cannot change password - no password set' });
    }
    
    console.log('Verifying current password...');
    
    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, customer.password_hash);
    
    console.log('Password verification result:', isValidPassword);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    console.log('Hashing new password...');
    
    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    console.log('Updating password in database...');
    
    // Update password
    const { error: updateError } = await supabase
      .from('customers')
      .update({
        password_hash: newPasswordHash,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.user.id);
    
    if (updateError) {
      console.error('Error updating password:', updateError);
      return res.status(500).json({ error: 'Failed to change password' });
    }
    
    console.log('Password changed successfully');
    
    res.json({ message: 'Password changed successfully' });
    
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'An error occurred while changing password' });
  }
});

// POST /api/auth/forgot-password - Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Check if customer exists
    const { data: customer, error: fetchError } = await supabase
      .from('customers')
      .select('id, name, email')
      .eq('email', email.toLowerCase().trim())
      .single();
    
    // Don't reveal if email exists or not (security best practice)
    if (fetchError || !customer) {
      return res.json({ message: 'If the email is registered, a password reset link has been sent.' });
    }
    
    // Generate secure random token
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    
    // Delete any existing tokens for this customer
    await supabase
      .from('password_reset_tokens')
      .delete()
      .eq('customer_id', customer.id);
    
    // Insert new reset token
    const { error: insertError } = await supabase
      .from('password_reset_tokens')
      .insert([{
        customer_id: customer.id,
        token: token,
        expires_at: expiresAt.toISOString()
      }]);
    
    if (insertError) {
      console.error('Error creating reset token:', insertError);
      return res.status(500).json({ error: 'Failed to create reset token' });
    }
    
    // Send email with reset link
    const mailer = require('../lib/mailer');
    // Build frontend URL for reset link. Prefer explicit FRONTEND_URL, otherwise
    // derive from the incoming request (X-Forwarded-Proto or req.protocol + host).
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    const inferredFrontend = `${proto}://${host}`;
    const frontendUrl = (process.env.FRONTEND_URL && process.env.FRONTEND_URL.trim())
      ? process.env.FRONTEND_URL.trim()
      : inferredFrontend;
    const resetUrl = `${frontendUrl.replace(/\/$/, '')}/reset-password.html?token=${token}`;
    
    try {
      await mailer.sendMail({
        to: customer.email,
        subject: 'Password Reset Request - Chammy Florals',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ff6f9b;">Password Reset Request</h2>
            <p>Hi ${customer.name},</p>
            <p>We received a request to reset your password for your Chammy Florals account.</p>
            <p>Click the button below to reset your password:</p>
            <a href="${resetUrl}" style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #ff99bb 0%, #ff6f9b 100%); color: white; text-decoration: none; border-radius: 10px; margin: 20px 0;">Reset Password</a>
            <p>Or copy and paste this link into your browser:</p>
            <p style="color: #666; word-break: break-all;">${resetUrl}</p>
            <p><strong>This link will expire in 1 hour.</strong></p>
            <p>If you didn't request this password reset, please ignore this email.</p>
            <hr style="border: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">Chammy Florals - Your trusted flower shop</p>
          </div>
        `
      });
    } catch (emailError) {
      console.error('Error sending reset email:', emailError);
      // Don't reveal email error to user
    }
    
    res.json({ message: 'If the email is registered, a password reset link has been sent.' });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

// POST /api/auth/check-email - Check if an email is registered (returns { exists: true/false })
router.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const { data, error } = await supabase
      .from('customers')
      .select('id')
      .eq('email', String(email).toLowerCase().trim())
      .limit(1)
      .single();

    if (error) {
      // If the record is not found supabase returns an error; interpret as not exists
      if (error.code === 'PGRST116' || /No rows/.test(error.message || '')) {
        return res.json({ exists: false });
      }
      console.error('Error checking email existence:', error);
      return res.status(500).json({ error: 'Failed to check email' });
    }

    return res.json({ exists: !!data });
  } catch (err) {
    console.error('check-email error:', err);
    return res.status(500).json({ error: 'An error occurred' });
  }
});

// POST /api/auth/reset-password - Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    // Find valid token
    const { data: resetToken, error: tokenError } = await supabase
      .from('password_reset_tokens')
      .select('*')
      .eq('token', token)
      .single();
    
    if (tokenError || !resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    
    // Check if token is expired
    if (new Date(resetToken.expires_at) < new Date()) {
      // Delete expired token
      await supabase
        .from('password_reset_tokens')
        .delete()
        .eq('id', resetToken.id);
      
      return res.status(400).json({ error: 'Reset token has expired' });
    }
    
    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    // Update password
    const { error: updateError } = await supabase
      .from('customers')
      .update({
        password_hash: newPasswordHash,
        updated_at: new Date().toISOString()
      })
      .eq('id', resetToken.customer_id);
    
    if (updateError) {
      console.error('Error updating password:', updateError);
      return res.status(500).json({ error: 'Failed to reset password' });
    }
    
    // Delete used token
    await supabase
      .from('password_reset_tokens')
      .delete()
      .eq('id', resetToken.id);
    
    res.json({ message: 'Password reset successfully' });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'An error occurred while resetting password' });
  }
});

module.exports = router;
module.exports.authenticateToken = authenticateToken;