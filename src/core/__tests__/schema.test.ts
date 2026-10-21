import Ajv from 'ajv';

import examplePolicy from '../../../docs/examples/policy.json';
import exampleReleases from '../../../docs/examples/releases.json';
import policySchema from '../../../schemas/policy.schema.json';
import releasesSchema from '../../../schemas/releases.schema.json';
import { validatePolicy, validateReleases } from '../validate';
import { policy } from './fixtures';

const ajv = new Ajv({ allErrors: true, strict: false });
const schemaPolicy = ajv.compile(policySchema);
const schemaReleases = ajv.compile(releasesSchema);

// The JSON Schema is for editors; the runtime validator is the source of truth. They must agree
// on everything a schema can express (the runtime adds cross-field checks on top).
const policyCorpus: unknown[] = [
  examplePolicy,
  policy(),
  { schemaVersion: 1 },
  { schemaVersion: 2 },
  { schemaVersion: 1, android: { latest: { version: '1.0', build: '1.2.3' } } },
  { schemaVersion: 1, android: { latest: { version: 'x', build: 1 } } },
  { schemaVersion: 1, android: { latest: { version: '1.0.0' } } },
  { schemaVersion: 1, android: { rollout: 101 } },
  { schemaVersion: 1, android: { recommendAfterDays: null, requireAfterDays: 3 } },
  { schemaVersion: 1, android: { requireAfterDays: -2 } },
  { schemaVersion: 1, android: { ota: { applyMode: 'prompt' } } },
  { schemaVersion: 1, android: { ota: { applyMode: 'whenever' } } },
  { schemaVersion: 1, ios: { appStoreId: '123' } },
  { schemaVersion: 1, ios: { appStoreId: 'abc' } },
  { schemaVersion: 1, ios: { country: 'in' } },
  { schemaVersion: 1, ios: { country: 'ind' } },
  { schemaVersion: 1, android: { message: { title: 'Hi' } } },
  { schemaVersion: 1, android: { message: { title: 5 } } },
  { schemaVersion: 1, android: { requiredMessage: { body: 'Please update' } } },
  { schemaVersion: 1, ios: { requiredMessage: { body: '' } } },
];

const releasesCorpus: unknown[] = [
  exampleReleases,
  { schemaVersion: 1, releases: [] },
  { schemaVersion: 1 },
  {
    schemaVersion: 1,
    releases: [
      {
        id: 'a',
        platforms: ['ios'],
        runtimeVersion: '1',
        kind: 'fix',
        notes: 'n',
        publishedAt: '2026-01-01',
      },
    ],
  },
  {
    schemaVersion: 1,
    releases: [
      {
        id: 'a',
        platforms: ['web'],
        runtimeVersion: '1',
        kind: 'fix',
        notes: 'n',
        publishedAt: '2026-01-01',
      },
    ],
  },
  {
    schemaVersion: 1,
    releases: [
      {
        id: 'a',
        platforms: ['ios'],
        runtimeVersion: '1',
        kind: 'hidden',
        notes: 'n',
        publishedAt: '2026-01-01',
      },
    ],
  },
  {
    schemaVersion: 1,
    releases: [
      { id: 'a', platforms: ['ios'], runtimeVersion: '1', kind: 'fix', publishedAt: '2026-01-01' },
    ],
  },
];

describe('JSON Schemas', () => {
  it('accept the documented examples', () => {
    expect(schemaPolicy(examplePolicy)).toBe(true);
    expect(schemaReleases(exampleReleases)).toBe(true);
    expect(validatePolicy(examplePolicy)).toMatchObject({ ok: true, warnings: [] });
    expect(validateReleases(exampleReleases)).toMatchObject({ ok: true, warnings: [] });
  });

  it.each(policyCorpus.map((doc) => [JSON.stringify(doc).slice(0, 80), doc]))(
    'policy schema agrees with validatePolicy: %s',
    (_, doc) => {
      expect(schemaPolicy(doc)).toBe(validatePolicy(doc).ok);
    }
  );

  it.each(releasesCorpus.map((doc) => [JSON.stringify(doc).slice(0, 80), doc]))(
    'releases schema agrees with validateReleases: %s',
    (_, doc) => {
      expect(schemaReleases(doc)).toBe(validateReleases(doc).ok);
    }
  );
});
