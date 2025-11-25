const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

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