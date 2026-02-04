// routes/vouchers.js - Voucher management and validation endpoints
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');

console.log('✅ Vouchers routes file loaded');

// Test route to verify routes are working
router.get('/test', (req, res) => {
  res.json({ message: 'Vouchers routes are working!' });
});

// ============================================
// PUBLIC ENDPOINTS (for customers)
// ============================================

// Validate and apply voucher code
router.post('/validate', async (req, res) => {
  try {
    const { code, orderAmount, customerEmail, customerId } = req.body;

    if (!code || !orderAmount || !customerEmail) {
      return res.status(400).json({ 
        valid: false, 
        error: 'Voucher code, order amount, and customer email are required' 
      });
    }

    // Fetch voucher by code
    const { data: voucher, error: voucherError } = await supabase
      .from('vouchers')
      .select('*')
      .eq('code', code.toUpperCase())
      .single();

    if (voucherError || !voucher) {
      return res.json({ valid: false, error: 'Invalid voucher code' });
    }

    // Check if voucher is active
    if (!voucher.is_active) {
      return res.json({ valid: false, error: 'This voucher is no longer active' });
    }

    // Check validity period
    const now = new Date();
    if (voucher.valid_from && new Date(voucher.valid_from) > now) {
      return res.json({ valid: false, error: 'This voucher is not yet valid' });
    }
    if (voucher.valid_until && new Date(voucher.valid_until) < now) {
      return res.json({ valid: false, error: 'This voucher has expired' });
    }

    // Check minimum order amount
    if (voucher.min_order_amount && orderAmount < voucher.min_order_amount) {
      return res.json({ 
        valid: false, 
        error: `Minimum order amount of ₱${voucher.min_order_amount} required` 
      });
    }

    // Check maximum total uses
    if (voucher.max_uses !== null) {
      const { count, error: countError } = await supabase
        .from('voucher_usage')
        .select('*', { count: 'exact', head: true })
        .eq('voucher_id', voucher.id);

      if (countError) throw countError;

      if (count >= voucher.max_uses) {
        return res.json({ valid: false, error: 'This voucher has reached its usage limit' });
      }
    }

    // Check uses per customer
    if (voucher.uses_per_customer !== null) {
      const { count: customerUses, error: customerError } = await supabase
        .from('voucher_usage')
        .select('*', { count: 'exact', head: true })
        .eq('voucher_id', voucher.id)
        .eq('customer_email', customerEmail);

      if (customerError) throw customerError;

      if (customerUses >= voucher.uses_per_customer) {
        return res.json({ 
          valid: false, 
          error: 'You have already used this voucher the maximum number of times' 
        });
      }
    }

    // Check customer eligibility type
    if (voucher.eligible_customer_type && voucher.eligible_customer_type !== 'all') {
      // Check if customer has previous orders
      const { count: orderCount, error: orderError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('email', customerEmail);

      if (orderError) throw orderError;

      if (voucher.eligible_customer_type === 'new' && orderCount > 0) {
        return res.json({ valid: false, error: 'This voucher is only for new customers' });
      }
      if (voucher.eligible_customer_type === 'returning' && orderCount === 0) {
        return res.json({ valid: false, error: 'This voucher is only for returning customers' });
      }
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (voucher.discount_type === 'percentage') {
      discountAmount = (orderAmount * voucher.discount_value) / 100;
      // Apply max discount cap if set
      if (voucher.max_discount_amount && discountAmount > voucher.max_discount_amount) {
        discountAmount = voucher.max_discount_amount;
      }
    } else {
      discountAmount = voucher.discount_value;
    }

    // Ensure discount doesn't exceed order amount
    discountAmount = Math.min(discountAmount, orderAmount);

    res.json({
      valid: true,
      voucher: {
        id: voucher.id,
        code: voucher.code,
        description: voucher.description,
        discount_type: voucher.discount_type,
        discount_value: voucher.discount_value
      },
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      finalAmount: parseFloat((orderAmount - discountAmount).toFixed(2))
    });

  } catch (error) {
    console.error('Error validating voucher:', error);
    res.status(500).json({ valid: false, error: 'Failed to validate voucher' });
  }
});

// Record voucher usage (called after order is created)
router.post('/use', async (req, res) => {
  try {
    const { voucherId, orderId, customerEmail, customerId, discountAmount } = req.body;

    if (!voucherId || !orderId || !customerEmail || discountAmount === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data, error } = await supabase
      .from('voucher_usage')
      .insert({
        voucher_id: voucherId,
        order_id: orderId,
        customer_email: customerEmail,
        customer_id: customerId || null,
        discount_amount: discountAmount
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, usage: data });

  } catch (error) {
    console.error('Error recording voucher usage:', error);
    res.status(500).json({ error: 'Failed to record voucher usage' });
  }
});

// ============================================
// ADMIN ENDPOINTS (requires auth)
// ============================================

// Get all vouchers
router.get('/admin/vouchers', auth, async (req, res) => {
  try {
    console.log('Fetching vouchers from database...');
    const { data, error } = await supabase
      .from('vouchers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error fetching vouchers:', error);
      throw error;
    }

    console.log(`Found ${(data || []).length} vouchers`);

    // Get usage count for each voucher
    const vouchersWithUsage = await Promise.all((data || []).map(async (voucher) => {
      const { count } = await supabase
        .from('voucher_usage')
        .select('*', { count: 'exact', head: true })
        .eq('voucher_id', voucher.id);

      return { ...voucher, usage_count: count || 0 };
    }));

    res.json(vouchersWithUsage);
  } catch (error) {
    console.error('Error fetching vouchers:', error);
    res.status(500).json({ error: 'Failed to fetch vouchers', details: error.message });
  }
});

// Get single voucher with usage details
router.get('/admin/vouchers/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: voucher, error: voucherError } = await supabase
      .from('vouchers')
      .select('*')
      .eq('id', id)
      .single();

    if (voucherError) throw voucherError;
    if (!voucher) return res.status(404).json({ error: 'Voucher not found' });

    // Get usage history
    const { data: usage, error: usageError } = await supabase
      .from('voucher_usage')
      .select('*')
      .eq('voucher_id', id)
      .order('used_at', { ascending: false });

    if (usageError) throw usageError;

    res.json({ voucher, usage: usage || [] });
  } catch (error) {
    console.error('Error fetching voucher:', error);
    res.status(500).json({ error: 'Failed to fetch voucher' });
  }
});

// Create new voucher
router.post('/admin/vouchers', auth, async (req, res) => {
  try {
    const {
      code,
      description,
      discount_type,
      discount_value,
      max_discount_amount,
      min_order_amount,
      max_uses,
      uses_per_customer,
      eligible_customer_type,
      valid_from,
      valid_until,
      is_active
    } = req.body;

    // Validation
    if (!code || !discount_type || !discount_value) {
      return res.status(400).json({ error: 'Code, discount type, and discount value are required' });
    }

    if (!['percentage', 'fixed'].includes(discount_type)) {
      return res.status(400).json({ error: 'Invalid discount type' });
    }

    const { data, error } = await supabase
      .from('vouchers')
      .insert({
        code: code.toUpperCase(),
        description,
        discount_type,
        discount_value,
        max_discount_amount: max_discount_amount || null,
        min_order_amount: min_order_amount || 0,
        max_uses: max_uses || null,
        uses_per_customer: uses_per_customer || 1,
        eligible_customer_type: eligible_customer_type || 'all',
        valid_from: valid_from || new Date().toISOString(),
        valid_until: valid_until || null,
        is_active: is_active !== undefined ? is_active : true,
        created_by: req.user?.email || 'admin'
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Voucher code already exists' });
      }
      throw error;
    }

    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating voucher:', error);
    res.status(500).json({ error: 'Failed to create voucher' });
  }
});

// Update voucher
router.put('/admin/vouchers/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    
    // Remove fields that shouldn't be updated
    delete updates.id;
    delete updates.created_at;
    delete updates.created_by;
    
    // Add updated_at timestamp
    updates.updated_at = new Date().toISOString();
    
    // Uppercase the code if provided
    if (updates.code) {
      updates.code = updates.code.toUpperCase();
    }

    const { data, error } = await supabase
      .from('vouchers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Voucher code already exists' });
      }
      throw error;
    }

    if (!data) return res.status(404).json({ error: 'Voucher not found' });

    res.json(data);
  } catch (error) {
    console.error('Error updating voucher:', error);
    res.status(500).json({ error: 'Failed to update voucher' });
  }
});

// Delete voucher
router.delete('/admin/vouchers/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('vouchers')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Voucher deleted successfully' });
  } catch (error) {
    console.error('Error deleting voucher:', error);
    res.status(500).json({ error: 'Failed to delete voucher' });
  }
});

// Toggle voucher active status
router.patch('/admin/vouchers/:id/toggle', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Get current status
    const { data: voucher, error: fetchError } = await supabase
      .from('vouchers')
      .select('is_active')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;
    if (!voucher) return res.status(404).json({ error: 'Voucher not found' });

    // Toggle status
    const { data, error } = await supabase
      .from('vouchers')
      .update({ 
        is_active: !voucher.is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error toggling voucher:', error);
    res.status(500).json({ error: 'Failed to toggle voucher status' });
  }
});

module.exports = router;
