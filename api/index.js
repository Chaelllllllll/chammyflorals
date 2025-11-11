const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const apiRoutes = require('../src/routes/api');
const adminRoutes = require('../src/routes/admin');
const messengerRoutes = require('../src/routes/messenger');
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
        // Allow Google Fonts stylesheet and common CDNs for styles
        styleSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com', "'unsafe-inline'"],
        // Allow scripts from self and common CDNs. 'unsafe-inline' is added here
        // as a pragmatic compatibility measure for existing inline scripts in
        // the static HTML files. For stronger security, move inline scripts to
        // external files and use nonces or hashes instead of 'unsafe-inline'.
        scriptSrc: [
          "'self'",
          'https://cdn.jsdelivr.net',
          'https://www.google.com',
          'https://www.gstatic.com',
          "'sha256-Vf+GW0yKtct7GeV10jtC6PA6hf4F3eDZaI6YiPDkP2s='",
          "'unsafe-inline'",
        ],
        scriptSrcAttr: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.vercel.app', 'https://*.supabase.co'],
        connectSrc: ["'self'", 'https://www.google.com', 'https://*.supabase.co', 'https://cdn.jsdelivr.net'],
        // Allow fonts.gstatic.com for font binary resources used by Google Fonts
  // Allow font resources from cdn.jsdelivr.net (bootstrap-icons), Cloudflare and Google Fonts
  fontSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
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

// SECURITY FIX: Limit JSON payload size to prevent DoS attacks
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiter — use a keyGenerator that prefers the X-Forwarded-For header when
// available (common on serverless platforms) and emit standard headers for
// monitoring. This prevents express-rate-limit from throwing when the
// Forwarded header is present.

// Public rate limiter (for customer-facing pages)
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for:
    // 1. /admin paths (HTML pages - admins need to work freely)
    // 2. /api/admin paths (API routes - have their own rate limiting below)
    // 3. Static assets (CSS, JS, images, fonts, etc.)
    const isAdminPath = req.path.startsWith('/admin') || req.path.startsWith('/api/admin');
    const isStaticAsset = req.path.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|json)$/i);
    const isWellKnown = req.path.startsWith('/.well-known');

    return isAdminPath || isStaticAsset || isWellKnown;
  },
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

// Admin API rate limiter (generous limit for authenticated users)
// This protects against compromised tokens being used to spam the API
const adminApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // generous limit - 1000 requests per 15 min for authenticated admins
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin API requests. Please slow down.' },
  keyGenerator: (req /*, res*/) => {
    const xf = req.headers['x-forwarded-for'] || req.headers['forwarded'] || req.headers['x-real-ip'];
    if (xf && typeof xf === 'string') return xf.split(',')[0].trim();
    try {
      return ipKeyGenerator(req.ip);
    } catch (err) {
      return req.ip || '';
    }
  },
});

// Apply public rate limiting
app.use(publicLimiter);

// Static files (optional)
app.use(express.static('public'));

// Routes
app.use('/api', apiRoutes);
// Mount admin routes under /api/admin so requests sent to /api/admin/* reach the
// Express router when Vercel routes them to /api/index.js.
// Apply generous rate limiting to admin API (protects against compromised tokens)
app.use('/api/admin', adminApiLimiter, adminRoutes);
// Messenger webhook endpoint
app.use('/api/messenger', messengerRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 🚀 Instead of app.listen, export the app for Vercel to handle
module.exports = app;
