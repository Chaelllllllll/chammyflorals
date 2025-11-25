import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || 'https://8cc06799284d643d0ee160c29493ff24@o4510425216057344.ingest.us.sentry.io/4510425223331840',
  
  // Always enabled - Sentry will only send events in release builds
  enabled: true,
  
  // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
  tracesSampleRate: 1.0,
  
  // Enable debug in development to see if events are being sent
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
  
  // Before send hook - allow all events
  beforeSend(event, hint) {
    // Log in development to verify events are being created
    if (__DEV__) {
      console.log('Sentry event:', event.message || event.exception);
    }
    return event;
  },
});

export default Sentry;
