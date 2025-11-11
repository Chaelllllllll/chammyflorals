const validateInquiry = (req, res, next) => {
  const { user_name, user_email, items, rush } = req.body;

  // Check required fields
  if (!user_name || !user_email || !rush) {
    return res.status(400).json({ error: 'Missing required fields: user_name, user_email, rush' });
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user_email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Validate items array (new format)
  if (items && Array.isArray(items)) {
    if (items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    // Validate each item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.flower_type) {
        return res.status(400).json({ error: `Item ${i + 1}: flower_type is required` });
      }
      if (!item.quantity || item.quantity < 1) {
        return res.status(400).json({ error: `Item ${i + 1}: quantity must be at least 1` });
      }
    }
  } else {
    // Fallback: check old format (flower_type and quantity)
    const { flower_type, quantity } = req.body;
    if (!flower_type || !quantity) {
      return res.status(400).json({ error: 'Missing required fields: items or (flower_type and quantity)' });
    }
    if (quantity < 1) {
      return res.status(400).json({ error: 'Quantity must be at least 1' });
    }
  }

  next();
};

module.exports = { inquiry: validateInquiry };