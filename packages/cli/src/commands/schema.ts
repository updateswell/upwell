// Inlined at build time (tsdown `noExternal`), so this prints the schema the CLI validates with.
import policySchema from '@upwell/core/schemas/policy.schema.json';
import releasesSchema from '@upwell/core/schemas/releases.schema.json';

import type { Context } from '../context';

const SCHEMAS = { policy: policySchema, releases: releasesSchema };

export async function schema(ctx: Context, name: keyof typeof SCHEMAS): Promise<void> {
  const value = SCHEMAS[name];
  // The schema is the output, with or without --json; --json wraps it like every other result.
  if (ctx.json) ctx.done(value);
  else ctx.io.stdout(JSON.stringify(value, null, 2) + '\n');
}
