const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Optimize bundle size
config.transformer = {
  ...config.transformer,
  minifierConfig: {
    compress: {
      // Drop console statements in production
      drop_console: true,
    },
  },
};

module.exports = config;
