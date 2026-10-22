import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// @upwell/core has no dependencies and runs in React Native, Node and Workers. Every import in
// src/ must stay inside src/ (tests may import what they like).
const src = join(__dirname, '..');
const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter(
  (f) => f.endsWith('.ts') && !f.split(/[\\/]/).includes('__tests__')
);
const specifier =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;

describe('src/ imports', () => {
  it('finds the source files', () => {
    expect(files).toEqual(expect.arrayContaining(['index.ts', 'decide.ts', 'validate.ts']));
  });

  it.each(files)('%s only imports from inside src/', (file) => {
    const code = readFileSync(join(src, file), 'utf8');
    const outside = [...code.matchAll(specifier)]
      .map((m) => m[1]!)
      .filter((s) => !s.startsWith('./') || join(file, '..', s).startsWith('..'));
    expect(outside).toEqual([]);
  });
});
