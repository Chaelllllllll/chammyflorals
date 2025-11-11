/**
 * Caching Middleware
 * Simple in-memory cache for frequently accessed data
 */

const NodeCache = require('node-cache');

// Create cache instance
// stdTTL: 600 seconds (10 minutes) default TTL
// checkperiod: 120 seconds - how often to check for expired keys
const cache = new NodeCache({ 
  stdTTL: 600, 
  checkperiod: 120,
  useClones: false // Don't clone objects (better performance)
});

/**
 * Cache middleware factory
 * @param {number} duration - Cache duration in seconds (default: 600 = 10 minutes)
 * @returns {Function} Express middleware
 */
const cacheMiddleware = (duration = 600) => {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Create cache key from URL and query params
    const key = `__express__${req.originalUrl || req.url}`;

    // Try to get cached response
    const cachedResponse = cache.get(key);

    if (cachedResponse) {
      // Cache hit - return cached response
      return res.json(cachedResponse);
    }

    // Cache miss - store original res.json function
    const originalJson = res.json.bind(res);

    // Override res.json to cache the response
    res.json = (body) => {
      // Cache the response
      cache.set(key, body, duration);
      
      // Send the response
      return originalJson(body);
    };

    next();
  };
};

/**
 * Clear cache for specific key or pattern
 * @param {string} pattern - Key or pattern to clear
 */
const clearCache = (pattern) => {
  if (pattern) {
    // Clear specific key
    if (cache.has(pattern)) {
      cache.del(pattern);
      return true;
    }
    
    // Clear keys matching pattern
    const keys = cache.keys();
    const matchingKeys = keys.filter(key => key.includes(pattern));
    if (matchingKeys.length > 0) {
      cache.del(matchingKeys);
      return true;
    }
    
    return false;
  } else {
    // Clear all cache
    cache.flushAll();
    return true;
  }
};

/**
 * Get cache statistics
 */
const getCacheStats = () => {
  return cache.getStats();
};

/**
 * Get all cache keys
 */
const getCacheKeys = () => {
  return cache.keys();
};

/**
 * Manually set cache value
 */
const setCache = (key, value, ttl) => {
  return cache.set(key, value, ttl);
};

/**
 * Manually get cache value
 */
const getCache = (key) => {
  return cache.get(key);
};

module.exports = {
  cacheMiddleware,
  clearCache,
  getCacheStats,
  getCacheKeys,
  setCache,
  getCache,
  cache, // Export cache instance for direct access if needed
};

