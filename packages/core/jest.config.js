/** @type {import('jest').Config} */
module.exports = {
  // Plain Node, no React Native preset: core must not need one.
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/__tests__/**'],
};
