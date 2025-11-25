const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { verifyAdmin } = require('../middleware/auth');

// Get current system status (public)
router.get('/current', async (req, res) => {
  try {
    const { data: status, error } = await supabase
      .from('system_status')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // Get active incidents
    const { data: incidents, error: incidentsError } = await supabase
      .from('incidents')
      .select('*')
      .eq('status', 'ongoing')
      .order('created_at', { ascending: false });

    if (incidentsError) throw incidentsError;

    // Check service health
    const services = await checkServicesHealth();

    res.json({
      status: status || {
        overall_status: 'operational',
        website_status: 'operational',
        mobile_app_status: 'operational',
        payment_status: 'operational',
        database_status: 'operational',
        updated_at: new Date().toISOString()
      },
      services,
      activeIncidents: incidents || [],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching status:', error);
    res.status(500).json({ error: 'Failed to fetch system status' });
  }
});

// Get all incidents (public)
router.get('/incidents', async (req, res) => {
  try {
    const { data: incidents, error } = await supabase
      .from('incidents')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({ incidents: incidents || [] });
  } catch (error) {
    console.error('Error fetching incidents:', error);
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

// Get incident by ID (public)
router.get('/incidents/:id', async (req, res) => {
  try {
    const { data: incident, error } = await supabase
      .from('incidents')
      .select('*, incident_updates(*)')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    res.json({ incident });
  } catch (error) {
    console.error('Error fetching incident:', error);
    res.status(404).json({ error: 'Incident not found' });
  }
});

// Get status history (public)
router.get('/history', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: history, error } = await supabase
      .from('system_status')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ history: history || [] });
  } catch (error) {
    console.error('Error fetching status history:', error);
    res.status(500).json({ error: 'Failed to fetch status history' });
  }
});

// Admin: Update system status
router.post('/update', verifyAdmin, async (req, res) => {
  try {
    const {
      overall_status,
      website_status,
      mobile_app_status,
      payment_status,
      database_status,
      message
    } = req.body;

    const { data, error } = await supabase
      .from('system_status')
      .insert({
        overall_status,
        website_status,
        mobile_app_status,
        payment_status,
        database_status,
        message,
        updated_by: req.user.email
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, status: data });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Admin: Create incident
router.post('/incidents', verifyAdmin, async (req, res) => {
  try {
    const {
      title,
      description,
      severity,
      affected_services,
      status
    } = req.body;

    const { data, error } = await supabase
      .from('incidents')
      .insert({
        title,
        description,
        severity,
        affected_services,
        status: status || 'ongoing',
        created_by: req.user.email
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, incident: data });
  } catch (error) {
    console.error('Error creating incident:', error);
    res.status(500).json({ error: 'Failed to create incident' });
  }
});

// Admin: Update incident
router.put('/incidents/:id', verifyAdmin, async (req, res) => {
  try {
    const { title, description, severity, affected_services, status } = req.body;

    const { data, error } = await supabase
      .from('incidents')
      .update({
        title,
        description,
        severity,
        affected_services,
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, incident: data });
  } catch (error) {
    console.error('Error updating incident:', error);
    res.status(500).json({ error: 'Failed to update incident' });
  }
});

// Admin: Add incident update
router.post('/incidents/:id/updates', verifyAdmin, async (req, res) => {
  try {
    const { message, status } = req.body;

    const { data, error } = await supabase
      .from('incident_updates')
      .insert({
        incident_id: req.params.id,
        message,
        status,
        created_by: req.user.email
      })
      .select()
      .single();

    if (error) throw error;

    // Update incident status if provided
    if (status) {
      await supabase
        .from('incidents')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', req.params.id);
    }

    res.json({ success: true, update: data });
  } catch (error) {
    console.error('Error adding incident update:', error);
    res.status(500).json({ error: 'Failed to add incident update' });
  }
});

// Helper function to check services health
async function checkServicesHealth() {
  const services = {
    database: 'operational',
    api: 'operational',
    storage: 'operational'
  };

  try {
    // Check database connection
    const { error: dbError } = await supabase
      .from('products')
      .select('id')
      .limit(1);
    
    if (dbError) {
      services.database = 'degraded';
    }

    // Check storage
    const { error: storageError } = await supabase
      .storage
      .from('products')
      .list('', { limit: 1 });

    if (storageError) {
      services.storage = 'degraded';
    }
  } catch (error) {
    console.error('Health check error:', error);
    services.api = 'degraded';
  }

  return services;
}

module.exports = router;
