const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// Optimize bundle size
config.transformer = {
  ...config.transformer,
  minifierConfig: {
    compress: {
      // Keep console.error and console.warn in production for debugging
      // Only drop console.log, console.info, console.debug
      pure_funcs: ['console.log', 'console.info', 'console.debug'],
    },
  },
};

module.exports = config;