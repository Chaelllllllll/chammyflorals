const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const apiRoutes = require('../src/routes/api');
const adminRoutes = require('../src/routes/admin');
require('dotenv').config();

const app = express();

// When running behind proxies (Vercel, Heroku, etc.) trust the first proxy so
// req.ip is derived from X-Forwarded-For. This avoids express-rate-limit
// validation errors related to forwarded headers (ERR_ERL_FORWARDED_HEADER).
// Use `1` to trust the first proxy (recommended on Vercel / serverless).
app.set('trust proxy', 1);

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

// Rate limiter — use a keyGenerator that prefers the X-Forwarded-For header when
// available (common on serverless platforms) and emit standard headers for
// monitoring. This prevents express-rate-limit from throwing when the
// Forwarded header is present.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req /*, res*/) => {
    // Prefer the X-Forwarded-For / Forwarded headers set by proxies (Vercel).
    const xf = req.headers['x-forwarded-for'] || req.headers['forwarded'] || req.headers['x-real-ip'];
    if (xf && typeof xf === 'string') return xf.split(',')[0].trim();
    // Fall back to the request IP but normalize IPv6 using the library helper
    // to satisfy express-rate-limit validations.
    try {
      return ipKeyGenerator(req.ip);
    } catch (err) {
      return req.ip || '';
    }
  },
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
