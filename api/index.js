// Load environment variables FIRST before any other modules
require('dotenv').config();

// Log environment status for debugging
console.log('========================================');
console.log('API Initialization');
console.log('========================================');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'MISSING');
console.log('SUPABASE_KEY:', process.env.SUPABASE_KEY ? 'SET' : 'MISSING');
console.log('SESSION_SECRET:', process.env.SESSION_SECRET ? 'SET' : 'MISSING');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'SET' : 'MISSING');
console.log('========================================');

// Validate critical environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('CRITICAL: Missing required environment variables:', missingEnvVars);
  console.error('Please set these in Vercel Environment Variables');
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

// Try to load routes with error handling
let passport, apiRoutes, adminRoutes, authRoutes, announcementsRoutes, vouchersRoutes;

try {
  passport = require('../src/config/passport');
  console.log('✓ Passport loaded');
} catch (err) {
  console.error('✗ Failed to load passport:', err.message);
}

try {
  apiRoutes = require('../src/routes/api');
  console.log('✓ API routes loaded');
} catch (err) {
  console.error('✗ Failed to load API routes:', err.message);
}

try {
  adminRoutes = require('../src/routes/admin');
  console.log('✓ Admin routes loaded');
} catch (err) {
  console.error('✗ Failed to load admin routes:', err.message);
}



try {
  authRoutes = require('../src/routes/auth');
  console.log('✓ Auth routes loaded');
} catch (err) {
  console.error('✗ Failed to load auth routes:', err.message);
}

try {
  announcementsRoutes = require('../src/routes/announcements');
  console.log('✓ Announcements routes loaded');
} catch (err) {
  console.error('✗ Failed to load announcements routes:', err.message);
}

try {
  vouchersRoutes = require('../src/routes/vouchers');
  console.log('✓ Vouchers routes loaded');
} catch (err) {
  console.error('✗ Failed to load vouchers routes:', err.message);
}

// Push notification routes removed per cleanup: push functionality disabled

console.log('Note: Google/Facebook OAuth removed from project');
console.log('========================================');

const app = express();

// When running behind proxies (Vercel, Heroku, etc.) trust the first proxy so
// req.ip is derived from X-Forwarded-For. This avoids express-rate-limit
// validation errors related to forwarded headers (ERR_ERL_FORWARDED_HEADER).
// Use `1` to trust the first proxy (recommended on Vercel / serverless).
app.set('trust proxy', 1);

// Minimal request logging - Always log in production to debug
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Helmet security setup
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Allow Google Fonts stylesheet and common CDNs for styles
        styleSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com', 'https://unpkg.com', "'unsafe-inline'"],
        // Allow scripts from self and common CDNs. 'unsafe-inline' is added here
        // as a pragmatic compatibility measure for existing inline scripts in
        // the static HTML files. For stronger security, move inline scripts to
        // external files and use nonces or hashes instead of 'unsafe-inline'.
        scriptSrc: [
          "'self'",
          'https://cdn.jsdelivr.net',
          'https://www.gstatic.com',
          'https://unpkg.com',
          "'unsafe-inline'",
          "'unsafe-hashes'",
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.vercel.app', 'https://*.supabase.co', 'https://*.googleusercontent.com', 'https://*.tile.openstreetmap.org', 'https://tile.openstreetmap.org', 'https://unpkg.com'],
        connectSrc: [
          "'self'",
          'https://*.supabase.co',
          'https://cdn.jsdelivr.net',
          'https://unpkg.com',
          // OpenStreetMap Nominatim geocoding for the map picker
          'https://nominatim.openstreetmap.org',
          // Web Push services (browser-managed network calls may rely on connect-src)
          'https://fcm.googleapis.com',
          'https://updates.push.services.mozilla.com',
          'https://web.push.apple.com'
        ],
        // Allow fonts.gstatic.com for font binary resources used by Google Fonts
  // Allow font resources from cdn.jsdelivr.net (bootstrap-icons), Cloudflare and Google Fonts
  fontSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
        frameSrc: ["'self'", 'https://www.gstatic.com'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  })
);

// CORS setup - Allow all origins in production for now
const corsOptions = {
  origin: '*', // Allow all origins
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));

// SECURITY FIX: Limit JSON payload size to prevent DoS attacks
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration for Passport
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

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

// Parse cookies for authentication checks
app.use(cookieParser());

// Protect admin pages from unauthorized direct access
app.use('/admin', (req, res, next) => {
  if (req.path === '/login.html') {
    return next();
  }

  const token = req.cookies.adminToken;
  if (token) {
    try {
      const JWT_SECRET = process.env.JWT_SECRET;
      const JWT_SECRET_SAFE = JWT_SECRET || 'dev-jwt-secret-change-in-production';
      const decoded = jwt.verify(token, JWT_SECRET_SAFE);
      const adminId = decoded.id || decoded.adminId || decoded.user_id || decoded.userId;
      if (adminId) {
        return next();
      }
    } catch (err) {
      // Invalid/expired token
    }
  }

  // Not authenticated as admin: clear cookie and redirect
  res.clearCookie('adminToken');
  return res.redirect('/customer-login.html');
});

// Static files (optional)
app.use(express.static('public'));

// Health check endpoint (BEFORE routes)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    routesLoaded: {
      auth: !!authRoutes,
      api: !!apiRoutes,
      admin: !!adminRoutes,
      announcements: !!announcementsRoutes,
      vouchers: !!vouchersRoutes
    },
    note: 'Google/Facebook OAuth removed'
  });
});

// Register routes only if they loaded successfully
console.log('Registering routes...');

if (authRoutes) {
  app.use('/api/auth', authRoutes);
  console.log('✓ Customer auth routes registered at /api/auth');
}

if (announcementsRoutes) {
  app.use('/api/announcements', announcementsRoutes);
  console.log('✓ Announcements routes registered at /api/announcements');
}

if (vouchersRoutes) {
  app.use('/api/vouchers', vouchersRoutes);
  console.log('✓ Vouchers routes registered at /api/vouchers');
}

// Push routes intentionally not registered (functionality removed)

if (apiRoutes) {
  app.use('/api', apiRoutes);
  console.log('✓ API routes registered at /api');
}

if (adminRoutes) {
  app.use('/api/admin', adminApiLimiter, adminRoutes);
  console.log('✓ Admin routes registered at /admin');
}



console.log('Routes registration complete (Google/Facebook auth removed)');
console.log('========================================');

// Error handler
app.use((err, req, res, next) => {
  console.error('========================================');
  console.error('ERROR OCCURRED');
  console.error('URL:', req.url);
  console.error('Method:', req.method);
  console.error('Message:', err.message);
  console.error('Stack:', err.stack);
  console.error('========================================');
  
  res.status(err.status || 500).json({ 
    error: 'Internal server error',
    message: err.message,
    path: req.url
  });
});

// 404 handler - Must be after all routes
const path = require('path');
app.use((req, res) => {
  console.log('404 Not Found:', req.method, req.url);
  // If this is an API request, return JSON
  if (req.path && req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not Found', path: req.url, message: 'The requested resource does not exist' });
  }

  // Honour Accept header for HTML clients
  if (req.headers && req.headers.accept && req.headers.accept.indexOf('text/html') !== -1) {
    try {
      const p = path.resolve(__dirname, '..', 'public', '404.html');
      return res.status(404).sendFile(p);
    } catch (e) {
      return res.status(404).send('404 Not Found');
    }
  }

  // Default to JSON
  return res.status(404).json({ error: 'Not Found', path: req.url, message: 'The requested resource does not exist' });
});

// 🚀 Instead of app.listen, export the app for Vercel to handle
module.exports = app;
