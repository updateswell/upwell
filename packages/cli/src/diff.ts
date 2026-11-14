type Op = { kind: ' ' | '-' | '+'; line: string };

/**
 * Line diff of two small texts, as unified-style lines (`-` removed, `+` added, ` ` context) with
 * `context` unchanged lines around each change and `…` between hunks. Empty when equal.
 *
 * Policy and releases files are small and edits touch a few lines: the common prefix and suffix
 * are trimmed first, so the LCS table only covers the changed middle.
 */
export function lineDiff(before: string, after: string, context = 3): string[] {
  const a = splitLines(before);
  const b = splitLines(after);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  if (start === endA && start === endB) return [];

  const ops: Op[] = [
    ...a.slice(0, start).map((line): Op => ({ kind: ' ', line })),
    ...middle(a.slice(start, endA), b.slice(start, endB)),
    ...a.slice(endA).map((line): Op => ({ kind: ' ', line })),
  ];

  // Keep changed lines and `context` lines either side of them.
  const keep = new Array<boolean>(ops.length).fill(false);
  ops.forEach((op, i) => {
    if (op.kind === ' ') return;
    for (let j = Math.max(0, i - context); j <= Math.min(ops.length - 1, i + context); j++) {
      keep[j] = true;
    }
  });

  const out: string[] = [];
  let skipped = false;
  ops.forEach((op, i) => {
    if (!keep[i]) {
      skipped = true;
      return;
    }
    if (skipped && out.length > 0) out.push('…');
    skipped = false;
    out.push(`${op.kind} ${op.line}`);
  });
  return out;
}

function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Plain LCS over the changed region. */
function middle(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  // lcs[i][j]: LCS length of a[i:] and b[j:], flattened.
  const lcs = new Uint32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[at(i, j)] =
        a[i] === b[j]
          ? lcs[at(i + 1, j + 1)]! + 1
          : Math.max(lcs[at(i + 1, j)]!, lcs[at(i, j + 1)]!);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: ' ', line: a[i]! });
      i++;
      j++;
    } else if (lcs[at(i + 1, j)]! >= lcs[at(i, j + 1)]!) {
      ops.push({ kind: '-', line: a[i++]! });
    } else {
      ops.push({ kind: '+', line: b[j++]! });
    }
  }
  while (i < n) ops.push({ kind: '-', line: a[i++]! });
  while (j < m) ops.push({ kind: '+', line: b[j++]! });
  return ops;
}
