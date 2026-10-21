type Segment = number | string;

interface ParsedVersion {
  core: Segment[];
  pre: Segment[] | null;
}

function toSegments(part: string): Segment[] {
  return part
    .split(/[.\-_]/)
    .filter((s) => s.length > 0)
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s.toLowerCase()));
}

function parse(input: string | number): ParsedVersion {
  let v = String(input).trim();
  if (/^v\d/i.test(v)) v = v.slice(1);
  // Build metadata never affects ordering.
  const plus = v.indexOf('+');
  if (plus >= 0) v = v.slice(0, plus);
  const dash = v.indexOf('-');
  if (dash < 0) return { core: toSegments(v), pre: null };
  return { core: toSegments(v.slice(0, dash)), pre: toSegments(v.slice(dash + 1)) };
}

function compareSegment(a: Segment | undefined, b: Segment | undefined): number {
  const x = a ?? 0;
  const y = b ?? 0;
  if (typeof x === 'number' && typeof y === 'number') return Math.sign(x - y);
  // Numeric identifiers sort before alphanumeric ones (semver §11).
  if (typeof x === 'number') return -1;
  if (typeof y === 'number') return 1;
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Compares dotted versions or build numbers: `1.10.0 > 1.9.9`, `340 > 300`, `1.0.0-beta < 1.0.0`.
 * Missing segments count as 0, so `1.2 == 1.2.0`. Returns -1, 0 or 1.
 */
export function compareVersions(a: string | number, b: string | number): -1 | 0 | 1 {
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.core.length, pb.core.length);
  for (let i = 0; i < len; i++) {
    const c = compareSegment(pa.core[i], pb.core[i]);
    if (c !== 0) return c as -1 | 1;
  }
  if (!pa.pre && !pb.pre) return 0;
  if (!pa.pre) return 1;
  if (!pb.pre) return -1;
  const preLen = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < preLen; i++) {
    // A shorter prerelease sorts first when all shared segments are equal.
    if (pa.pre[i] === undefined) return -1;
    if (pb.pre[i] === undefined) return 1;
    const c = compareSegment(pa.pre[i], pb.pre[i]);
    if (c !== 0) return c as -1 | 1;
  }
  return 0;
}

/** True when the string looks like a version or build number this module can compare. */
export function isComparableVersion(v: unknown): boolean {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0;
  return typeof v === 'string' && /^v?\d+(\.\d+)*([-+][0-9A-Za-z.\-+]*)?$/.test(v.trim());
}
