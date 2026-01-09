const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const crypto = require('crypto');

const JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || 'customer-secret-key-change-in-production';
const SALT_ROUNDS = 10;

// Middleware to verify customer token
const authenticateCustomer = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    console.log('authenticateCustomer - Token present:', !!token);
    
    if (!token) {
      console.log('authenticateCustomer - No token provided');
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('authenticateCustomer - Token decoded:', decoded);
    
    // Verify customer exists
    const { data: customer, error } = await supabase
      .from('customers')
      .select('id, email, name, phone, address, profile_picture, google_id')
      .eq('id', decoded.customerId)
      .single();

    console.log('authenticateCustomer - Customer lookup result:', { customer, error });

    if (error || !customer) {
      console.log('authenticateCustomer - Customer not found or error:', error);
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.customer = customer;
    console.log('authenticateCustomer - Success for customer:', customer.email);
    next();
  } catch (error) {
    console.error('authenticateCustomer - Error:', error.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Sign up
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name, phone, address, fb_link } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if email already exists
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create customer
    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        name: name.trim(),
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        fb_link: fb_link?.trim() || null,
        email_verified: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id, email, name, phone, address, fb_link')
      .single();

    if (error) {
      console.error('Error creating customer:', error);
      return res.status(500).json({ error: 'Failed to create account' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { customerId: customer.id, email: customer.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        fb_link: customer.fb_link
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Get customer
    const { data: customer, error } = await supabase
      .from('customers')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !customer) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, customer.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    await supabase
      .from('customers')
      .update({ last_login: new Date().toISOString() })
      .eq('id', customer.id);

    // Generate JWT token
    const token = jwt.sign(
      { customerId: customer.id, email: customer.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        fb_link: customer.fb_link
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticateCustomer, async (req, res) => {
  res.json({
    success: true,
    customer: req.customer
  });
});

// Update profile
router.patch('/profile', authenticateCustomer, async (req, res) => {
  try {
    const { name, phone, address, fb_link } = req.body;
    
    const updates = {
      updated_at: new Date().toISOString()
    };

    if (name) updates.name = name.trim();
    if (phone !== undefined) updates.phone = phone?.trim() || null;
    if (address !== undefined) updates.address = address?.trim() || null;
    if (fb_link !== undefined) updates.fb_link = fb_link?.trim() || null;

    const { data: customer, error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', req.customer.id)
      .select('id, email, name, phone, address, fb_link')
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    res.json({
      success: true,
      customer
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
router.post('/change-password', authenticateCustomer, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Get current password hash
    const { data: customer } = await supabase
      .from('customers')
      .select('password_hash')
      .eq('id', req.customer.id)
      .single();

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, customer.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password
    const { error } = await supabase
      .from('customers')
      .update({
        password_hash: newPasswordHash,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.customer.id);

    if (error) {
      console.error('Error changing password:', error);
      return res.status(500).json({ error: 'Failed to change password' });
    }

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Get customer's orders
router.get('/orders', authenticateCustomer, async (req, res) => {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_id', req.customer.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching orders:', error);
      return res.status(500).json({ error: 'Failed to fetch orders' });
    }

    res.json({
      success: true,
      orders: orders || []
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Update customer profile
router.put('/update-profile', authenticateCustomer, async (req, res) => {
  try {
    const { name, phone, address, city } = req.body;
    const customerId = req.user.id;

    const { data, error } = await supabase
      .from('customers')
      .update({
        name: name,
        phone: phone,
        address: address,
        city: city
      })
      .eq('id', customerId)
      .select()
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    res.json({ customer: data });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = { router, authenticateCustomer };
