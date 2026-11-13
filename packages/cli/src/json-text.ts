import {
  applyEdits,
  findNodeAtLocation,
  modify,
  parseTree,
  type FormattingOptions,
  type JSONPath,
} from 'jsonc-parser';

/**
 * A JSON document edited as text, so a change touches only the lines it changes: hand formatting,
 * key order and inline objects elsewhere stay as they were. The files are reviewed in pull
 * requests; reformatting the whole file on every edit would bury the change.
 */
export class JsonText {
  text: string;
  private readonly format: FormattingOptions;

  constructor(text: string) {
    this.text = text;
    this.format = { insertSpaces: true, tabSize: detectIndent(text), eol: '\n' };
  }

  get value(): unknown {
    return JSON.parse(this.text);
  }

  /**
   * Sets `path` to `value`. A new key goes before the first existing key that comes after it in
   * `order`; a replaced value written on one line stays on one line.
   */
  set(path: JSONPath, value: unknown, order?: readonly string[]): void {
    const existing = findNodeAtLocation(parseTree(this.text)!, path);
    if (existing) {
      const old = this.text.slice(existing.offset, existing.offset + existing.length);
      const inline = !old.includes('\n') && inlineJson(value);
      if (inline) {
        this.text = applyEdits(this.text, [
          { offset: existing.offset, length: existing.length, content: inline },
        ]);
        return;
      }
    }
    const key = path[path.length - 1];
    this.apply(path, value, {
      getInsertionIndex:
        order && typeof key === 'string'
          ? (properties) => insertionIndex(properties, key, order)
          : undefined,
    });
  }

  /** Inserts into the array at `path` (its last element is the index). */
  insert(path: JSONPath, value: unknown): void {
    this.apply(path, value, { isArrayInsertion: true });
  }

  remove(path: JSONPath): void {
    this.apply(path, undefined, {});
  }

  private apply(
    path: JSONPath,
    value: unknown,
    options: { isArrayInsertion?: boolean; getInsertionIndex?: (props: string[]) => number }
  ): void {
    const edits = modify(this.text, path, value, { formattingOptions: this.format, ...options });
    this.text = applyEdits(this.text, edits);
  }
}

function insertionIndex(properties: string[], key: string, order: readonly string[]): number {
  const rank = order.indexOf(key);
  if (rank === -1) return properties.length;
  const at = properties.findIndex((p) => order.includes(p) && order.indexOf(p) > rank);
  return at === -1 ? properties.length : at;
}

/** `{ "version": "3.4.0", "build": 340 }` for flat objects and scalars; null otherwise. */
function inlineJson(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return JSON.stringify(value);
  if (Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([, v]) => typeof v === 'object' && v !== null)) return null;
  if (entries.length === 0) return '{}';
  return `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`;
}

function detectIndent(text: string): number {
  const match = /^( +)\S/m.exec(text);
  return match ? match[1]!.length : 2;
}
