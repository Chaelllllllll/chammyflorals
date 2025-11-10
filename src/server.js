const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
require('dotenv').config();

const app = express();

// Minimal request logging in non-production to avoid leaking sensitive routing info in prod logs
app.use((req, res, next) => {
  if ((process.env.NODE_ENV || 'development') !== 'production') {
    console.log(`${req.method} ${req.url}`);
  }
  next();
});

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
          "'sha256-Vf+GW0yKtct7GeV10jtC6PA6hf4F3eDZaI6YiPDkP2s='", // Hash for inline script
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
// In production restrict CORS to a configured origin; allow all in development
const corsOptions = (process.env.NODE_ENV === 'production' && process.env.FRONTEND_ORIGIN)
  ? { origin: process.env.FRONTEND_ORIGIN }
  : {};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure route-specific rate limiters. Values can be tuned via environment variables.
const PUBLIC_RATE_MAX = Number(process.env.PUBLIC_RATE_MAX || 150); // requests per window
const LOGIN_RATE_MAX = Number(process.env.ADMIN_LOGIN_MAX || 6); // admin login attempts
const API_RATE_MAX = Number(process.env.API_RATE_MAX || 1000);
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 15 * 60 * 1000);

const publicLimiter = rateLimit({ windowMs: RATE_WINDOW_MS, max: PUBLIC_RATE_MAX, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: RATE_WINDOW_MS, max: API_RATE_MAX, standardHeaders: true, legacyHeaders: false });

// Apply api limiter to /api routes
app.use('/api', apiLimiter);

// Apply public limiter to public static assets and other public routes
app.use(publicLimiter);
app.use(express.static('public'));

app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Instead of app.listen, export the app for Vercel
module.exports = app;