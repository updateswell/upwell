import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: 'src/index.ts',
  format: ['esm', 'cjs'],
  platform: 'neutral',
  target: 'es2022',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  // .mjs/.cjs (and .d.mts/.d.cts) whatever package.json's "type" is.
  fixedExtension: true,
});
