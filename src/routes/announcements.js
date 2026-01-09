const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authenticateAdmin = require('../middleware/auth');
const multer = require('multer');
const { sendPushNotification } = require('../lib/push-notifications');
const upload = multer({ storage: multer.memoryStorage() });

// Helper function to broadcast messages to all customers
async function broadcastToAllCustomers(message, productId = null) {
  try {
    // Get all customers
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('id');
    
    if (customersError) {
      console.error('Error fetching customers for broadcast:', customersError);
      return;
    }
    
    if (!customers || customers.length === 0) {
      console.log('No customers found to broadcast message');
      return;
    }
    
    // Prepare messages for all customers
    const messages = customers.map(customer => ({
      customer_id: customer.id,
      sender_type: 'seller',
      message: message,
      product_id: productId,
      created_at: new Date().toISOString()
    }));
    
    // Insert all messages into customer_messages table
    const { error: messagesError } = await supabase
      .from('customer_messages')
      .insert(messages);
    
    if (messagesError) {
      console.error('Error broadcasting messages to customers:', messagesError);
      return;
    }
    
    console.log(`Broadcast message sent to ${customers.length} customers`);
    
    // Note: Push notifications via Expo tokens would require expo_push_token column in customers table
    // Currently skipping push notifications as the column doesn't exist
  } catch (error) {
    console.error('Error in broadcastToAllCustomers:', error);
  }
}

// GET /api/announcements - Get active announcements (public)
router.get('/', async (req, res) => {
    try {
        const now = new Date().toISOString();
        
        const { data: announcements, error } = await supabase
            .from('announcements')
            .select('*')
            .eq('is_active', true)
            .lte('start_date', now)
            .or(`end_date.is.null,end_date.gte.${now}`)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        res.json({ announcements: announcements || [] });
    } catch (error) {
        console.error('Error fetching announcements:', error);
        res.status(500).json({ error: 'Failed to fetch announcements' });
    }
});

// GET /api/announcements/admin - Get all announcements (admin only)
router.get('/admin', authenticateAdmin, async (req, res) => {
    try {
        const { data: announcements, error } = await supabase
            .from('announcements')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        res.json({ announcements: announcements || [] });
    } catch (error) {
        console.error('Error fetching announcements:', error);
        res.status(500).json({ error: 'Failed to fetch announcements' });
    }
});

// POST /api/announcements - Create announcement (admin only)
router.post('/', authenticateAdmin, upload.single('image'), async (req, res) => {
    try {
        const { title, description, type, is_active } = req.body;
        
        if (!title || !description) {
            return res.status(400).json({ error: 'Title and description are required' });
        }
        
        let image_url = null;
        
        // Upload image to Supabase Storage if provided
        if (req.file) {
            try {
                const fileExt = req.file.originalname.split('.').pop();
                const fileName = `announcement-${Date.now()}.${fileExt}`;
                
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('announcements')
                    .upload(fileName, req.file.buffer, {
                        contentType: req.file.mimetype,
                        upsert: false
                    });
                
                if (uploadError) {
                    console.error('Upload error:', uploadError);
                    console.warn('⚠️ Image upload failed. Create "announcements" bucket in Supabase Storage.');
                } else {
                    const { data: urlData } = supabase.storage
                        .from('announcements')
                        .getPublicUrl(fileName);
                    image_url = urlData.publicUrl;
                    console.log('✅ Image uploaded successfully:', image_url);
                }
            } catch (uploadErr) {
                console.error('Image upload exception:', uploadErr);
                console.warn('⚠️ Continuing without image...');
            }
        }
        
        const { data: announcement, error } = await supabase
            .from('announcements')
            .insert([{
                title,
                description,
                image_url,
                type: type || 'general',
                start_date: new Date().toISOString(),
                end_date: null,
                is_active: is_active === 'true' || is_active === true,
                created_by: req.admin && req.admin.id ? req.admin.id : null
            }])
            .select()
            .single();
        
        if (error) throw error;
        
        // Broadcast message to all customers about new announcement
        try {
          await broadcastToAllCustomers(
            JSON.stringify({ title: announcement.title, description: announcement.description, id: announcement.id }),
            null
          );
          console.log('Broadcast message sent for new announcement');
        } catch (broadcastError) {
          console.error('Failed to broadcast announcement:', broadcastError);
          // Don't fail the announcement creation if broadcast fails
        }
        
        res.json({ message: 'Announcement created successfully', announcement });
    } catch (error) {
        console.error('Error creating announcement:', error);
        res.status(500).json({ error: 'Failed to create announcement' });
    }
});

// PUT /api/announcements/:id - Update announcement (admin only)
router.put('/:id', authenticateAdmin, upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, type, is_active, start_date, end_date } = req.body;
        
        const updateData = {
            updated_at: new Date().toISOString()
        };
        
        if (title) updateData.title = title;
        if (description) updateData.description = description;
        if (type) updateData.type = type;
        if (is_active !== undefined) updateData.is_active = is_active === 'true' || is_active === true;
        if (start_date) updateData.start_date = start_date;
        if (end_date !== undefined) updateData.end_date = end_date || null;
        
        // Upload new image if provided
        if (req.file) {
            try {
                const fileExt = req.file.originalname.split('.').pop();
                const fileName = `announcement-${Date.now()}.${fileExt}`;
                
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('announcements')
                    .upload(fileName, req.file.buffer, {
                        contentType: req.file.mimetype,
                        upsert: false
                    });
                
                if (!uploadError) {
                    const { data: urlData } = supabase.storage
                        .from('announcements')
                        .getPublicUrl(fileName);
                    updateData.image_url = urlData.publicUrl;
                    console.log('✅ Image updated successfully:', updateData.image_url);
                } else {
                    console.error('Upload error:', uploadError);
                    console.warn('⚠️ Image upload failed. Update continuing without new image.');
                }
            } catch (uploadErr) {
                console.error('Image upload exception:', uploadErr);
                console.warn('⚠️ Continuing without image update...');
            }
        }
        
        const { data: announcement, error } = await supabase
            .from('announcements')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();
        
        if (error) throw error;
        
        res.json({ message: 'Announcement updated successfully', announcement });
    } catch (error) {
        console.error('Error updating announcement:', error);
        res.status(500).json({ error: 'Failed to update announcement' });
    }
});

// DELETE /api/announcements/:id - Delete announcement (admin only)
router.delete('/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const { error } = await supabase
            .from('announcements')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        res.json({ message: 'Announcement deleted successfully' });
    } catch (error) {
        console.error('Error deleting announcement:', error);
        res.status(500).json({ error: 'Failed to delete announcement' });
    }
});

// GET /api/product-notifications - Get user's product notifications
router.get('/product-notifications', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'chamflorals-secret-key-change-in-production';
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const { data: notifications, error } = await supabase
            .from('product_notifications')
            .select(`
                *,
                products (
                    id,
                    name,
                    image_url,
                    category,
                    pricing,
                    addons
                )
            `)
            .eq('customer_id', decoded.id)
            .eq('is_read', false)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        res.json({ notifications: notifications || [] });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// POST /api/product-notifications/:id/read - Mark notification as read
router.post('/product-notifications/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        
        const { error } = await supabase
            .from('product_notifications')
            .update({ is_read: true })
            .eq('id', id);
        
        if (error) throw error;
        
        res.json({ message: 'Notification marked as read' });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

module.exports = router;
