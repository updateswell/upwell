const { defineConfig } = require('eslint/config');
const universe = require('eslint-config-universe/flat/native');
const universeWeb = require('eslint-config-universe/flat/web');

module.exports = defineConfig([
  {
    ignores: [
      'packages/*/build',
      'packages/upwell/plugin/build',
      'packages/*/dist',
      'example',
      'apps/docs',
      '**/coverage',
      '**/node_modules',
    ],
  },
  ...universe,
  ...universeWeb,
  { rules: { 'no-void': ['warn', { allowAsStatement: true }] } },
]);
