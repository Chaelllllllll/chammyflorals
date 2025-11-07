const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const apiRoutes = require('../src/routes/api');
const adminRoutes = require('../src/routes/admin');
require('dotenv').config();

const app = express();

// Minimal request logging (only outside production)
app.use((req, res, next) => {
  if ((process.env.NODE_ENV || 'development') !== 'production') {
    console.log(`${req.method} ${req.url}`);
  }
  next();
});

// Helmet security setup
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', "'unsafe-inline'"],
        scriptSrc: [
          "'self'",
          'https://cdn.jsdelivr.net',
          'https://www.google.com',
          'https://www.gstatic.com',
          "'sha256-Vf+GW0yKtct7GeV10jtC6PA6hf4F3eDZaI6YiPDkP2s='",
        ],
        scriptSrcAttr: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.vercel.app', 'https://*.supabase.co'],
        connectSrc: ["'self'", 'https://www.google.com', 'https://*.supabase.co', 'https://cdn.jsdelivr.net'],
        fontSrc: ["'self'", 'https://cdnjs.cloudflare.com'],
        frameSrc: ["'self'", 'https://www.google.com', 'https://www.gstatic.com'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  })
);

// CORS setup
const corsOptions =
  process.env.NODE_ENV === 'production' && process.env.FRONTEND_ORIGIN
    ? { origin: process.env.FRONTEND_ORIGIN }
    : {};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Static files (optional)
app.use(express.static('public'));

// Routes
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 🚀 Instead of app.listen, export the app for Vercel to handle
module.exports = app;
