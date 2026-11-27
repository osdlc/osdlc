import { describe, expect, test } from 'vitest'

import { diffHeaderPath, parseDiff, unquoteCPath } from '../src/diff/parse.ts'
import { diff } from './helpers.ts'

const hunk = ['@@ -1,1 +1,2 @@', ' keep', '+added', ''].join('\n')

describe('unquoteCPath', () => {
  test('decodes octal UTF-8 bytes and quote escapes', () => {
    expect(unquoteCPath('"w\\303\\251\\"rd.ts"')).toBe('wé"rd.ts')
    expect(unquoteCPath('"tab\\there\\\\x"')).toBe('tab\there\\x')
  })

  test('keeps a raw character outside the BMP', () => {
    expect(unquoteCPath('"b/a\\"\u{1F600}.ts"')).toBe('b/a"\u{1F600}.ts')
  })

  test('leaves an unquoted name alone', () => {
    expect(unquoteCPath('plain.ts')).toBe('plain.ts')
  })
})

describe('diffHeaderPath', () => {
  test('strips the prefix, the TAB git adds after a name with spaces, and /dev/null is null', () => {
    expect(diffHeaderPath('+++ b/src/my file.ts\t')).toBe('src/my file.ts')
    expect(diffHeaderPath('--- a/src/x.ts')).toBe('src/x.ts')
    expect(diffHeaderPath('+++ /dev/null')).toBeNull()
  })

  test('decodes a C-quoted name', () => {
    expect(diffHeaderPath('+++ "b/w\\303\\251\\"rd.ts"')).toBe('wé"rd.ts')
  })

  test('a C-quoted name with a space: the TAB after the quote is stripped too', () => {
    expect(diffHeaderPath('+++ "b/a b\\303\\251.ts"\t')).toBe('a bé.ts')
    expect(diffHeaderPath('--- "a/a b\\303\\251.ts"\t')).toBe('a bé.ts')
  })
})

describe('parseDiff paths', () => {
  const one = (header: string[], extra: string[] = []) =>
    parseDiff([...header, ...extra, hunk].join('\n'))[0]!

  test('a name with a space', () => {
    const f = one([
      'diff --git a/my file.ts b/my file.ts',
      '--- a/my file.ts\t',
      '+++ b/my file.ts\t',
    ])
    expect(f.path).toBe('my file.ts')
    expect(f.added).toEqual([{ text: 'added', at: 2, block: 0 }])
  })

  test('a name with a quote and a non-ASCII character', () => {
    const q = '"b/w\\303\\251\\"rd.ts"'
    const f = one([
      `diff --git "a/w\\303\\251\\"rd.ts" ${q}`,
      '--- "a/w\\303\\251\\"rd.ts"',
      `+++ ${q}`,
    ])
    expect(f.path).toBe('wé"rd.ts')
  })

  test('a quoted rename and a header-only entry', () => {
    const f = parseDiff(
      [
        'diff --git "a/\\303\\251.ts" "b/\\303\\274.ts"',
        'similarity index 100%',
        'rename from "\\303\\251.ts"',
        'rename to "\\303\\274.ts"',
        '',
      ].join('\n'),
    )[0]!
    expect(f).toMatchObject({ path: 'ü.ts', oldPath: 'é.ts', status: 'renamed' })
    const mode = parseDiff('diff --git "a/\\303\\251.ts" "b/\\303\\251.ts"\nold mode 100644\n')[0]!
    expect(mode.path).toBe('é.ts')
  })

  test('a header-only entry under a directory whose name ends in " b"', () => {
    const bin = parseDiff(
      'diff --git a/docs/a b/c.png b/docs/a b/c.png\nnew file mode 100644\nindex 0000000..1234567\nBinary files /dev/null and "b/docs/a b/c.png" differ\n',
    )[0]!
    expect(bin.path).toBe('docs/a b/c.png')
    const empty = parseDiff(
      'diff --git a/docs/a b/empty.ts b/docs/a b/empty.ts\nnew file mode 100644\nindex 0000000..e69de29\n',
    )[0]!
    expect(empty.path).toBe('docs/a b/empty.ts')
  })

  test('a header-only entry whose path contains " b/"', () => {
    const bin = parseDiff(
      [
        'diff --git a/img b/logo.png b/img b/logo.png',
        'index 1..2 100644',
        'Binary files a/img b/logo.png and b/img b/logo.png differ',
        'diff --git a/img b/run.sh b/img b/run.sh',
        'old mode 100644',
        'new mode 100755',
        '',
      ].join('\n'),
    )
    expect(bin.map((f) => f.path)).toEqual(['img b/logo.png', 'img b/run.sh'])
  })

  test('a deleted file takes its name from the --- side', () => {
    const f = one([
      'diff --git a/gone me.ts b/gone me.ts',
      'deleted file mode 100644',
      '--- a/gone me.ts\t',
      '+++ /dev/null',
    ])
    expect(f.path).toBe('gone me.ts')
  })
})

describe('parseDiff lines and blocks', () => {
  test('numbers each changed line on its own side and groups runs into blocks', () => {
    const [f] = parseDiff(
      [
        'diff --git a/a.ts b/a.ts',
        '--- a/a.ts',
        '+++ b/a.ts',
        '@@ -2,2 +2,3 @@',
        '-old one',
        '+new one',
        ' kept',
        '+tail',
        '@@ -10 +11,0 @@',
        '--- looks like a header',
        '',
      ].join('\n'),
    )
    expect(f!.removed).toEqual([
      { text: 'old one', at: 2, block: 0 },
      { text: '-- looks like a header', at: 10, block: 2 },
    ])
    expect(f!.added).toEqual([
      { text: 'new one', at: 2, block: 0 },
      { text: 'tail', at: 4, block: 1 },
    ])
    expect(f!.blocks.map((b) => [b.removed.length, b.added.length])).toEqual([
      [1, 1],
      [0, 1],
      [1, 0],
    ])
  })

  test('statuses, binary files and a "no newline" marker', () => {
    const files = parseDiff(
      [
        'diff --git a/n.ts b/n.ts',
        'new file mode 100644',
        '--- /dev/null',
        '+++ b/n.ts',
        '@@ -0,0 +1 @@',
        '+x',
        '\\ No newline at end of file',
        'diff --git a/i.png b/i.png',
        'Binary files a/i.png and b/i.png differ',
      ].join('\n'),
    )
    expect(files.map((f) => [f.path, f.status, f.binary, f.added.length])).toEqual([
      ['n.ts', 'added', false, 1],
      ['i.png', 'modified', true, 0],
    ])
  })
})

test('a blank context line written without its space is still context', () => {
  const [f] = parseDiff(
    [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,3 +1,3 @@',
      ' a',
      '',
      '-b',
      '+B',
      '',
    ].join('\n'),
  )
  expect(f!.removed).toEqual([{ text: 'b', at: 3, block: 0 }])
  expect(f!.added).toEqual([{ text: 'B', at: 3, block: 0 }])
})

test('a dirty submodule, with no mode line, is still a submodule', () => {
  const [f] = parseDiff(
    'diff --git a/sm b/sm\n--- a/sm\n+++ b/sm\n@@ -1 +1 @@\n-Subproject commit 1111111111111111111111111111111111111111\n+Subproject commit 1111111111111111111111111111111111111111-dirty\n',
  )
  expect(f!.entry).toBe('submodule')
})

test("a CRLF line's text drops its \\r, so a change to LF endings changes no text", () => {
  const [f] = parseDiff(diff('a.ts', ['-const a = 1\r', '-  b()\r', '+const a = 1', '+  b()']))
  expect(f!.removed.map((l) => l.text)).toEqual(f!.added.map((l) => l.text))
  expect(f!.added.map((l) => l.text)).toEqual(['const a = 1', '  b()'])
})
