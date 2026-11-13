/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  // Core's sources, not its build, so tests don't need `npm run build` first.
  moduleNameMapper: {
    '^@upwell/core$': '<rootDir>/../core/src/index.ts',
    '^@upwell/core/schemas/(.*)$': '<rootDir>/../core/schemas/$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/__tests__/**', '!src/index.ts'],
};
