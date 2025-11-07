const validateInquiry = (req, res, next) => {
  const { user_name, user_email, flower_type, quantity, rush } = req.body;
  if (!user_name || !user_email || !flower_type || !quantity || !rush) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user_email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (quantity < 1) {
    return res.status(400).json({ error: 'Quantity must be at least 1' });
  }
  next();
};

module.exports = { inquiry: validateInquiry };