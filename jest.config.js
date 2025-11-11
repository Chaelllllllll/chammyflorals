/**
 * Jest Configuration
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Coverage directory
  coverageDirectory: 'coverage',

  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],

  // Collect coverage from these files
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/data/**',
    '!**/node_modules/**',
  ],

  // Test match patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js',
  ],

  // Setup files
  setupFilesAfterEnv: [],

  // Module paths
  modulePaths: ['<rootDir>'],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
  ],

  // Verbose output
  verbose: true,

  // Timeout
  testTimeout: 10000,
};

