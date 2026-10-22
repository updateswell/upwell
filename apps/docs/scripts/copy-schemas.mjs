// Serves the JSON Schemas at upwell.run/schemas/*: copies them from packages/upwell/schemas (the
// single source, also shipped in the npm package) into public/ before dev and build.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'public/schemas'), { recursive: true });
for (const name of ['policy.schema.json', 'releases.schema.json']) {
  cpSync(join(root, '../../packages/upwell/schemas', name), join(root, 'public/schemas', name));
}
console.log('copied schemas to public/schemas');
