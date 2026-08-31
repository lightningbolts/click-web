import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.next/',
    // Shared fixtures live under __tests__ but contain no tests of their own.
    '<rootDir>/__tests__/helpers/',
  ],
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    'app/api/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  // Baseline floor — ratchet upward as coverage improves. Measured against lib/ + app/api/.
  coverageThreshold: {
    global: {
      statements: 20,
      branches: 18,
      functions: 25,
      lines: 20,
    },
  },
};

export default createJestConfig(config);
