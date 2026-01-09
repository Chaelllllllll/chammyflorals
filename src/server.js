const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const session = require('express-session');
const passport = require('./config/passport');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const announcementsRoutes = require('./routes/announcements');
// const googleAuthRoutes = require('./routes/google-auth'); // Disabled - using manual auth only
require('dotenv').config();

const app = express();

// Force HTTPS in production (Vercel sets x-forwarded-proto header)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(301, `https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

// Request logging with Morgan
if (process.env.NODE_ENV !== 'production') {
  // Development: detailed logging
  app.use(morgan('dev'));
} else {
  // Production: combined format (Apache-style)
  app.use(morgan('combined'));
}

// Simplify CSP to avoid inline script blocking during OAuth/embedded scripts.
// If you want stricter CSP later, re-enable and serve scripts via external files.
app.use(
  helmet({
    contentSecurityPolicy: false, // disable CSP to avoid hash/nonce conflicts with inline scripts
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin' // Required for Google Sign-In to work
    }
  })
);
// In production restrict CORS to a configured origin; allow all in development
const corsOptions = (process.env.NODE_ENV === 'production' && process.env.FRONTEND_ORIGIN)
  ? { origin: process.env.FRONTEND_ORIGIN }
  : {};
app.use(cors(corsOptions));

// SECURITY FIX: Limit JSON payload size to prevent DoS attacks
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration for Passport
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // true in production (HTTPS)
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Configure route-specific rate limiters. Values can be tuned via environment variables.
const PUBLIC_RATE_MAX = Number(process.env.PUBLIC_RATE_MAX || 150); // requests per window
const API_RATE_MAX = Number(process.env.API_RATE_MAX || 1000);
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 15 * 60 * 1000);

const publicLimiter = rateLimit({ windowMs: RATE_WINDOW_MS, max: PUBLIC_RATE_MAX, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: RATE_WINDOW_MS, max: API_RATE_MAX, standardHeaders: true, legacyHeaders: false });

// Apply rate limiting BEFORE static files, but skip /admin paths completely
app.use((req, res, next) => {
  // Skip ALL rate limiting for /admin paths (HTML files and API routes)
  // Login endpoints have their own rate limiter in admin.js
  if (req.path.startsWith('/admin')) {
    return next();
  }

  // Apply API rate limiter to /api routes
  if (req.path.startsWith('/api')) {
    return apiLimiter(req, res, next);
  }

  // Apply public rate limiter to everything else
  publicLimiter(req, res, next);
});

// Serve static files
app.use(express.static('public'));

// Register routes
// app.use('/auth', googleAuthRoutes); // Google OAuth routes - DISABLED
app.use('/api/auth', authRoutes); // Customer authentication routes
app.use('/api/announcements', announcementsRoutes); // Announcements routes
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Instead of app.listen, export the app for Vercel
module.exports = app;