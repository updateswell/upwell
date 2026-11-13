import { lineDiff } from '../diff';

describe('lineDiff', () => {
  it('is empty for equal texts', () => {
    expect(lineDiff('a\nb\n', 'a\nb\n')).toEqual([]);
  });

  it('shows a new file as additions', () => {
    expect(lineDiff('', '{\n}\n')).toEqual(['+ {', '+ }']);
  });

  it('keeps context around a change and marks skipped lines', () => {
    const before = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].join('\n');
    const after = before.replace('2', 'two').replace('11', 'eleven');
    expect(lineDiff(before, after, 1)).toEqual([
      '  1',
      '- 2',
      '+ two',
      '  3',
      '…',
      '  10',
      '- 11',
      '+ eleven',
      '  12',
    ]);
  });

  it('handles insertions in the middle', () => {
    expect(lineDiff('a\nc\n', 'a\nb\nc\n')).toEqual(['  a', '+ b', '  c']);
  });
});
