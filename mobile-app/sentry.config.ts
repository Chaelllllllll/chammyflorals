import * as Sentry from '@sentry/react-native';

const SENTRY_DSN = 'https://8cc06799284d643d0ee160c29493ff24@o4510425216057344.ingest.us.sentry.io/4510425223331840';

Sentry.init({
  dsn: SENTRY_DSN,
  
  // Always enabled
  enabled: true,
  
  // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
  tracesSampleRate: 1.0,
  
  // Only enable debug logging in development
  debug: __DEV__,
  
  // Enable automatic session tracking
  enableAutoSessionTracking: true,
  
  // Session timeout in ms (default is 30000)
  sessionTrackingIntervalMillis: 30000,
  
  // Environment
  environment: __DEV__ ? 'development' : 'production',
  
  // Enable native crash reporting (works in production builds)
  enableNative: true,
  
  // Enable automatic breadcrumbs
  enableAutoPerformanceTracing: true,
});

export default Sentry;
