/**
 * Enhanced Input Validation Middleware
 * Provides comprehensive validation for all endpoints
 */

// Valid order statuses
const VALID_STATUSES = ['Pending', 'Processing', 'To Receive', 'Delivered', 'Cancelled'];

// Valid review statuses
const VALID_REVIEW_STATUSES = ['pending', 'approved', 'rejected'];

/**
 * Validate order status update
 */
const validateOrderStatus = (req, res, next) => {
  const { status } = req.body;
  
  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }
  
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ 
      error: 'Invalid status',
      validStatuses: VALID_STATUSES
    });
  }
  
  next();
};

/**
 * Validate order creation/inquiry
 */
const validateOrderCreation = (req, res, next) => {
  const { name, email, items } = req.body;
  
  // Required fields
  if (!name || !email || !items) {
    return res.status(400).json({ 
      error: 'Missing required fields: name, email, items' 
    });
  }
  
  // Name validation
  if (typeof name !== 'string' || name.length < 2 || name.length > 200) {
    return res.status(400).json({ 
      error: 'Name must be between 2 and 200 characters' 
    });
  }
  
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  
  if (email.length > 255) {
    return res.status(400).json({ error: 'Email too long' });
  }
  
  // Items validation
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items must be a non-empty array' });
  }
  
  if (items.length > 100) {
    return res.status(400).json({ error: 'Too many items (max 100)' });
  }
  
  // Validate each item
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    if (!item.flower_type || typeof item.flower_type !== 'string') {
      return res.status(400).json({ 
        error: `Item ${i + 1}: flower_type is required and must be a string` 
      });
    }
    
    if (item.flower_type.length > 500) {
      return res.status(400).json({ 
        error: `Item ${i + 1}: flower_type too long (max 500 characters)` 
      });
    }
    
    if (!item.quantity || !Number.isInteger(Number(item.quantity))) {
      return res.status(400).json({ 
        error: `Item ${i + 1}: quantity must be an integer` 
      });
    }
    
    const quantity = Number(item.quantity);
    if (quantity < 1 || quantity > 10000) {
      return res.status(400).json({ 
        error: `Item ${i + 1}: quantity must be between 1 and 10000` 
      });
    }
  }
  
  // Optional fields validation
  if (req.body.message && req.body.message.length > 2000) {
    return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
  }
  
  if (req.body.fb_link && req.body.fb_link.length > 500) {
    return res.status(400).json({ error: 'Facebook link too long' });
  }
  
  if (req.body.phone && req.body.phone.length > 50) {
    return res.status(400).json({ error: 'Phone number too long' });
  }
  
  next();
};

/**
 * Validate review submission
 */
const validateReview = (req, res, next) => {
  const { order_id, customer_name, rating, comment } = req.body;
  
  // Required fields
  if (!order_id || !customer_name || !rating || !comment) {
    return res.status(400).json({ 
      error: 'Missing required fields: order_id, customer_name, rating, comment' 
    });
  }
  
  // Order ID validation
  if (typeof order_id !== 'string' || order_id.length < 1 || order_id.length > 100) {
    return res.status(400).json({ error: 'Invalid order_id' });
  }
  
  // Customer name validation
  if (typeof customer_name !== 'string' || customer_name.length < 2 || customer_name.length > 200) {
    return res.status(400).json({ 
      error: 'Customer name must be between 2 and 200 characters' 
    });
  }
  
  // Rating validation
  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ 
      error: 'Rating must be an integer between 1 and 5' 
    });
  }
  
  // Comment validation
  if (typeof comment !== 'string' || comment.length < 10 || comment.length > 2000) {
    return res.status(400).json({ 
      error: 'Comment must be between 10 and 2000 characters' 
    });
  }
  
  next();
};

/**
 * Validate product creation/update
 */
const validateProduct = (req, res, next) => {
  const { name, category, pricing } = req.body;
  
  // Name validation (if provided)
  if (name !== undefined) {
    if (typeof name !== 'string' || name.length < 2 || name.length > 200) {
      return res.status(400).json({ 
        error: 'Product name must be between 2 and 200 characters' 
      });
    }
  }
  
  // Category validation (if provided)
  if (category !== undefined) {
    if (typeof category !== 'string' || category.length < 2 || category.length > 100) {
      return res.status(400).json({ 
        error: 'Category must be between 2 and 100 characters' 
      });
    }
  }
  
  // Pricing validation (if provided)
  if (pricing !== undefined) {
    if (!Array.isArray(pricing)) {
      return res.status(400).json({ error: 'Pricing must be an array' });
    }
    
    if (pricing.length > 50) {
      return res.status(400).json({ error: 'Too many pricing options (max 50)' });
    }
    
    for (let i = 0; i < pricing.length; i++) {
      const price = pricing[i];
      
      if (typeof price.price !== 'number' || price.price < 0 || price.price > 1000000) {
        return res.status(400).json({ 
          error: `Pricing ${i + 1}: price must be a number between 0 and 1,000,000` 
        });
      }
    }
  }
  
  next();
};

/**
 * Validate pagination parameters
 */
const validatePagination = (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  
  if (page < 1 || page > 10000) {
    return res.status(400).json({ error: 'Page must be between 1 and 10000' });
  }
  
  if (limit < 1 || limit > 100) {
    return res.status(400).json({ error: 'Limit must be between 1 and 100' });
  }
  
  // Attach validated values to request
  req.pagination = { page, limit };
  
  next();
};

/**
 * Sanitize string input (remove HTML tags, trim whitespace)
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').trim();
};

/**
 * Sanitize all string fields in request body
 */
const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeString(req.body[key]);
      }
    }
  }
  next();
};

module.exports = {
  validateOrderStatus,
  validateOrderCreation,
  validateReview,
  validateProduct,
  validatePagination,
  sanitizeBody,
  sanitizeString,
  VALID_STATUSES,
  VALID_REVIEW_STATUSES,
};

