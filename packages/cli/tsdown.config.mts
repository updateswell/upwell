import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: 'src/index.ts',
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  // One file for a fast `npx`: commander is bundled. @upwell/core stays a dependency so the CLI
  // and the app run the same engine; only its JSON Schemas are inlined for `upwell schema`.
  deps: {
    alwaysBundle: [/^@upwell\/core\/schemas\//],
    onlyBundle: ['commander', 'jsonc-parser'],
  },
  // jsonc-parser's `main` is UMD with requires the bundler can't follow; its ESM build bundles.
  alias: { 'jsonc-parser': 'jsonc-parser/lib/esm/main.js' },
  dts: false,
  fixedExtension: false,
});
