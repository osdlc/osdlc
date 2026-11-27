import { describe, expect, test } from 'vitest'

import type { FileContent } from '../src/types.ts'
import type { Change } from '../src/types.ts'
import type { LinguistAttributes } from '../src/types.ts'
import { buildCountReport } from '../src/report/count.ts'
import { createTypescriptAnalyzer, type Analyzer } from '../src/analysis/complexity.ts'
import { loadTypeScript } from '../src/analysis/typescript.ts'
import { buildDiffReport, type DiffContent } from '../src/report/diff.ts'
import { countReportSchema, diffReportSchema } from '../src/report/schema.ts'
import { CONTENT_KINDS, splitLines } from '../src/scan/kinds.ts'
import { createScannerRegistry } from '../src/scan/registry.ts'

const CHANGE: Change = {
  kind: 'range',
  label: 'a..b',
  pr: null,
  base: 'a'.repeat(40),
  head: 'b'.repeat(40),
}

const text = (t: string): FileContent => ({ kind: 'text', text: t })

function content(
  base: Record<string, string>,
  head: Record<string, string>,
  attributes: Record<string, LinguistAttributes> | null = {},
): DiffContent {
  const read = (files: Record<string, string>) => (paths: readonly string[]) =>
    new Map(
      paths.map((p): [string, FileContent] => [
        p,
        p in files ? text(files[p]!) : { kind: 'missing' },
      ]),
    )
  return {
    base: read(base),
    head: read(head),
    attributes: () => (attributes === null ? null : new Map(Object.entries(attributes))),
  }
}

const BEFORE = `import { a } from './a.ts'

/** Adds. */
export function add(x: number): number {
  return x + a
}
`
const AFTER = `import { a } from './a.ts'
import { b } from './b.ts'

/** Adds both. */
export function add(x: number): number {
  // a and b
  return x + a + b
}
`
const DIFF = `diff --git a/src/add.ts b/src/add.ts
--- a/src/add.ts
+++ b/src/add.ts
@@ -1,0 +2 @@
+import { b } from './b.ts'
@@ -3 +4 @@
-/** Adds. */
+/** Adds both. */
@@ -5 +6,2 @@
-  return x + a
+  // a and b
+  return x + a + b
`

describe('buildDiffReport', () => {
  test('counts each changed line by the kind its file scan gives', () => {
    const r = buildDiffReport(
      CHANGE,
      DIFF,
      content({ 'src/add.ts': BEFORE }, { 'src/add.ts': AFTER }),
    )
    expect(diffReportSchema.parse(r)).toEqual(r)
    expect(r.kindOperations).toEqual({
      logic: { added: 0, removed: 0, changed: 1, moved: 0 },
      boilerplate: { added: 1, removed: 0, changed: 0, moved: 0 },
      comment: { added: 1, removed: 0, changed: 0, moved: 0 },
      doc: { added: 0, removed: 0, changed: 1, moved: 0 },
      blank: { added: 0, removed: 0, changed: 0, moved: 0 },
    })
    expect(r.lines).toEqual({ added: 4, removed: 2 })
    expect(r.fileList[0]).toMatchObject({
      language: 'TypeScript',
      group: 'source',
      category: 'logic',
    })
    expect(r.notes).toEqual([])
  })

  test('added + changed + moved is what the diff adds; removed + changed + moved what it removes', () => {
    const r = buildDiffReport(
      CHANGE,
      DIFF,
      content({ 'src/add.ts': BEFORE }, { 'src/add.ts': AFTER }),
    )
    const sum = (f: (c: (typeof r.kindOperations)['logic']) => number) =>
      CONTENT_KINDS.reduce((n, k) => n + f(r.kindOperations[k]), 0)
    expect(sum((c) => c.added + c.changed + c.moved)).toBe(r.lines.added)
    expect(sum((c) => c.removed + c.changed + c.moved)).toBe(r.lines.removed)
  })

  test('a line replaced by a line of another kind counts as removed and added, so each net is right', () => {
    const before = 'const a = 1\n// old note\n// more\n'
    const after = 'const a = 1\nlog(a)\nlog(a, 2)\n'
    const d =
      'diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -2,2 +2,2 @@\n' +
      '-// old note\n-// more\n+log(a)\n+log(a, 2)\n'
    const r = buildDiffReport(CHANGE, d, content({ 'x.ts': before }, { 'x.ts': after }))
    expect(r.kindOperations.comment).toEqual({ added: 0, removed: 2, changed: 0, moved: 0 })
    expect(r.kindOperations.logic).toEqual({ added: 2, removed: 0, changed: 0, moved: 0 })
  })

  test('text that does not match the diff falls back to the one-line rule, with a note', () => {
    const r = buildDiffReport(
      CHANGE,
      DIFF,
      content({ 'src/add.ts': 'other\n' }, { 'src/add.ts': AFTER }),
    )
    expect(r.notes[0]).toMatch(
      /one-line comment rule, because their text could not be read or did not match the diff: src\/add\.ts/,
    )
  })

  test('with no commits, kinds come from the one-line rule and the content passes are skipped', () => {
    const r = buildDiffReport(
      { ...CHANGE, kind: 'pr', label: 'PR #3', pr: 3, base: null, head: null },
      DIFF,
      null,
    )
    expect(r.api.status).toBe('skipped')
    expect(r.complexity.status).toBe('skipped')
    expect(r.kindOperations.comment.changed).toBe(1)
    expect(r.notes.join('\n')).toMatch(/PR #3's commits are not in this checkout/)
  })

  test("the one-line rule reads each file's own comment markers", () => {
    const diff = [
      'diff --git a/a.rs b/a.rs\n--- a/a.rs\n+++ b/a.rs\n@@ -0,0 +1 @@\n+#[derive(Debug)]\n',
      'diff --git a/b.erl b/b.erl\n--- a/b.erl\n+++ b/b.erl\n@@ -0,0 +1 @@\n+% a note\n',
      'diff --git a/c.bat b/c.bat\n--- a/c.bat\n+++ b/c.bat\n@@ -0,0 +1,2 @@\n+REM a note\n+REMOVE=1\n',
    ].join('')
    const r = buildDiffReport(CHANGE, diff, null)
    expect(
      r.fileList.map((f) => [
        f.path,
        f.kindOperations?.comment.added,
        f.kindOperations?.logic.added,
      ]),
    ).toEqual([
      ['a.rs', 0, 1],
      ['b.erl', 1, 0],
      ['c.bat', 1, 1],
    ])
  })

  test('generated, vendored and binary files are counted by lines only', () => {
    const diff = [
      'diff --git a/bun.lock b/bun.lock\n--- a/bun.lock\n+++ b/bun.lock\n@@ -1 +1 @@\n-a\n+b\n',
      'diff --git a/vendor/x.go b/vendor/x.go\n--- a/vendor/x.go\n+++ b/vendor/x.go\n@@ -0,0 +1 @@\n+package x\n',
      'diff --git a/i.png b/i.png\nBinary files a/i.png and b/i.png differ\n',
    ].join('')
    const r = buildDiffReport(CHANGE, diff, content({}, {}))
    expect(r.fileList.map((f) => [f.group, f.category, f.kindOperations])).toEqual([
      ['generated', 'generated', null],
      ['vendored', 'vendored', null],
      ['other', 'non-text', null],
    ])
    expect(r.groups.generated).toEqual({ files: 1, added: 1, removed: 1 })
    expect(CONTENT_KINDS.every((k) => r.kindOperations[k].added === 0)).toBe(true)
  })

  test('instruction prose counts as logic', () => {
    const diff =
      'diff --git a/skills/x/SKILL.md b/skills/x/SKILL.md\n--- a/skills/x/SKILL.md\n+++ b/skills/x/SKILL.md\n@@ -0,0 +1,2 @@\n+Do the thing.\n+<!-- why -->\n'
    const r = buildDiffReport(
      CHANGE,
      diff,
      content(
        { 'skills/x/SKILL.md': '' },
        { 'skills/x/SKILL.md': 'Do the thing.\n<!-- why -->\n' },
      ),
    )
    expect(r.fileList[0]).toMatchObject({ group: 'instructions', category: 'instructions' })
    expect(r.kindOperations.logic.added).toBe(1)
    expect(r.kindOperations.comment.added).toBe(1)
  })

  test('linguist attributes decide groups, and a failure to read them is noted', () => {
    const diff =
      'diff --git a/src/gen.ts b/src/gen.ts\n--- a/src/gen.ts\n+++ b/src/gen.ts\n@@ -0,0 +1 @@\n+x()\n'
    const files = { 'src/gen.ts': 'x()\n' }
    const marked = buildDiffReport(
      CHANGE,
      diff,
      content({}, files, { 'src/gen.ts': { generated: true } }),
    )
    expect(marked.fileList[0]!.group).toBe('generated')
    const plain = buildDiffReport(CHANGE, diff, content({}, files, {}))
    expect(plain.fileList[0]!.group).toBe('source')
    const unread = buildDiffReport(CHANGE, diff, content({}, files, null))
    expect(unread.notes[0]).toMatch(/linguist attributes could not be read/)
  })

  test('comment-only and import-only edits get their own categories', () => {
    const comments =
      'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-// old\n+// new\n'
    const imports =
      "diff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n@@ -1 +1 @@\n-import { x } from './x.ts'\n+import { x, y } from './x.ts'\n"
    const r = buildDiffReport(
      CHANGE,
      comments + imports,
      content(
        { 'a.ts': '// old\n', 'b.ts': "import { x } from './x.ts'\n" },
        { 'a.ts': '// new\n', 'b.ts': "import { x, y } from './x.ts'\n" },
      ),
    )
    expect(r.categories.map((c) => [c.category, c.files])).toEqual([
      ['comments', 1],
      ['boilerplate', 1],
    ])
  })

  test('API and complexity read both sides', () => {
    const ts = loadTypeScript(process.cwd())
    const files = content({ 'src/add.ts': BEFORE }, { 'src/add.ts': AFTER })
    const r = buildDiffReport(CHANGE, DIFF, files, {
      typescript: ts,
      analyzers: [createTypescriptAnalyzer(ts)],
    })
    expect(r.api).toMatchObject({ status: 'ok', note: null })
    expect(r.complexity).toMatchObject({ status: 'ok', analyzers: ['typescript'] })
    expect(r.complexity).toMatchObject({ totalBefore: 1, totalAfter: 1, functionsChanged: 0 })
  })

  test('a lazy compiler API is loaded only when a TypeScript or JavaScript file needs it', () => {
    let loads = 0
    const lazy = {
      found: () => true,
      load: () => {
        loads += 1
        return loadTypeScript(process.cwd())
      },
    }
    const options = { typescript: lazy, analyzers: [createTypescriptAnalyzer(lazy)] }
    const py = buildDiffReport(
      CHANGE,
      'diff --git a/a.py b/a.py\n--- a/a.py\n+++ b/a.py\n@@ -1 +1 @@\n-x = 1\n+x = 2\n',
      content({ 'a.py': 'x = 1\n' }, { 'a.py': 'x = 2\n' }),
      options,
    )
    expect(loads).toBe(0)
    expect(py.api.note).toBeNull()
    expect(py.complexity.analyzers).toEqual(['typescript'])

    const files = content({ 'src/add.ts': BEFORE }, { 'src/add.ts': AFTER })
    const ts = buildDiffReport(CHANGE, DIFF, files, options)
    expect(loads).toBeGreaterThan(0)
    const eager = loadTypeScript(process.cwd())
    expect(ts).toEqual(
      buildDiffReport(CHANGE, DIFF, files, {
        typescript: eager,
        analyzers: [createTypescriptAnalyzer(eager)],
      }),
    )
  })

  test('a lazy compiler API that does not load is reported as missing', () => {
    let loaded = false
    const none = {
      found: () => !loaded,
      load: () => {
        loaded = true
        return null
      },
    }
    const r = buildDiffReport(
      CHANGE,
      DIFF,
      content({ 'src/add.ts': BEFORE }, { 'src/add.ts': AFTER }),
      { typescript: none, analyzers: [createTypescriptAnalyzer(none)] },
    )
    expect(loaded).toBe(true)
    expect(r.api.note).toMatch(/members were not read/)
    expect(r.complexity).toMatchObject({
      analyzers: [],
      note: expect.stringMatching(/no complexity analyzer/),
    })
  })

  test('with no analyzers or compiler API the passes say what they could not do', () => {
    const r = buildDiffReport(
      CHANGE,
      DIFF,
      content({ 'src/add.ts': BEFORE }, { 'src/add.ts': AFTER }),
    )
    expect(r.api.note).toMatch(/members were not read/)
    expect(r.complexity).toMatchObject({
      status: 'skipped',
      note: expect.stringMatching(/no complexity analyzer/),
    })
  })

  test('a file an analyzer fails on is noted as skipped, not scored as empty', () => {
    const failing: Analyzer = {
      id: 'broken',
      available: () => true,
      matches: (path) => path.endsWith('.ts'),
      analyze: () => {
        throw new Error('broken failed: timed out')
      },
    }
    const r = buildDiffReport(
      CHANGE,
      DIFF,
      content({ 'src/add.ts': BEFORE }, { 'src/add.ts': AFTER }),
      { analyzers: [failing] },
    )
    expect(r.complexity.movers).toEqual([])
    expect(r.notes.join('\n')).toContain('src/add.ts (broken failed: timed out)')
  })

  test("an added file's empty side is not analysed", () => {
    const seen: string[] = []
    const counting: Analyzer = {
      id: 'counting',
      available: () => true,
      matches: (path) => path.endsWith('.ts'),
      analyze: (text) => {
        seen.push(text)
        return new Map([['f', 1]])
      },
    }
    const added =
      'diff --git a/n.ts b/n.ts\nnew file mode 100644\n--- /dev/null\n+++ b/n.ts\n@@ -0,0 +1 @@\n+function f() {}\n'
    const r = buildDiffReport(CHANGE, added, content({}, { 'n.ts': 'function f() {}\n' }), {
      analyzers: [counting],
    })
    expect(seen).toEqual(['function f() {}\n'])
    expect(r.complexity.movers.map((m) => [m.name, m.before, m.after])).toEqual([['f', null, 1]])
  })

  test('an analyzer that scores files together is called once, its files scored in order', () => {
    const calls: string[][] = []
    const batching: Analyzer = {
      id: 'batching',
      available: () => true,
      matches: (path) => path.endsWith('.rs'),
      analyze: () => {
        throw new Error('analyze is not called when analyzeAll is there')
      },
      analyzeAll: (sources) => {
        calls.push(sources.map((s) => `${s.path}:${s.text.trim()}`))
        return sources.map((s) => new Map([['f', s.text.length]]))
      },
    }
    const file = (path: string, from: string | null, to: string) =>
      from === null
        ? `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1 @@\n+${to}\n`
        : `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-${from}\n+${to}\n`
    const r = buildDiffReport(
      CHANGE,
      file('a.rs', 'x', 'xyz') + file('b.rs', null, 'yy'),
      content({ 'a.rs': 'x\n' }, { 'a.rs': 'xyz\n', 'b.rs': 'yy\n' }),
      { analyzers: [batching] },
    )
    expect(calls).toEqual([['a.rs:x', 'a.rs:xyz', 'b.rs:yy']])
    expect(r.complexity.files.map((f) => [f.path, f.before, f.after])).toEqual([
      ['a.rs', 2, 4],
      ['b.rs', 0, 3],
    ])
  })

  test('files scored together go in batches of 25: a failed batch marks only its own, and none starts past the budget', () => {
    let t = 0
    const timeouts: (number | undefined)[] = []
    const batching: Analyzer = {
      id: 'batching',
      available: () => true,
      matches: (path) => path.endsWith('.rs'),
      analyze: () => {
        throw new Error('analyze is not called when analyzeAll is there')
      },
      analyzeAll: (sources, options) => {
        timeouts.push(options?.timeoutMs)
        t += 6_000
        if (timeouts.length === 1) throw new Error('batching failed: exit 1')
        return sources.map(() => new Map([['f', 1]]))
      },
    }
    const paths = Array.from({ length: 55 }, (_, i) => `f${String(i).padStart(2, '0')}.rs`)
    const diff = paths
      .map(
        (p) =>
          `diff --git a/${p} b/${p}\nnew file mode 100644\n--- /dev/null\n+++ b/${p}\n@@ -0,0 +1 @@\n+fn f() {}\n`,
      )
      .join('')
    const r = buildDiffReport(
      CHANGE,
      diff,
      content({}, Object.fromEntries(paths.map((p) => [p, 'fn f() {}\n']))),
      { analyzers: [batching], analysisBudgetMs: 10_000, maxAnalysisFiles: 100, now: () => t },
    )
    // The first batch has the whole budget; the second has the 5 s floor; the third never starts.
    expect(timeouts).toEqual([10_000, 5_000])
    expect(r.complexity.files.map((f) => f.path)).toEqual(paths.slice(25, 50))
    const note = r.notes.find((n) => n.startsWith('skipped 30 file(s)'))
    expect(note).toContain('f00.rs (batching failed: exit 1)')
  })

  test('a batch past the budget marks its files for the time budget', () => {
    let t = 0
    const batching: Analyzer = {
      id: 'batching',
      available: () => true,
      matches: (path) => path.endsWith('.rs'),
      analyze: () => new Map(),
      analyzeAll: () => {
        throw new Error('no batch starts once the budget is spent')
      },
    }
    const r = buildDiffReport(
      CHANGE,
      'diff --git a/a.rs b/a.rs\nnew file mode 100644\n--- /dev/null\n+++ b/a.rs\n@@ -0,0 +1 @@\n+fn f() {}\n',
      content({}, { 'a.rs': 'fn f() {}\n' }),
      // Read in time, then the clock passes the deadline before the batch.
      { analyzers: [batching], analysisBudgetMs: 5, now: () => (t += 4) },
    )
    expect(r.notes.join('\n')).toContain('a.rs (time budget)')
  })

  test('the time budget and the movers cap', () => {
    let t = 0
    const late = buildDiffReport(
      CHANGE,
      DIFF,
      content({ 'src/add.ts': BEFORE }, { 'src/add.ts': AFTER }),
      {
        analysisBudgetMs: 5,
        now: () => (t += 10),
      },
    )
    expect(late.notes.join('\n')).toMatch(/src\/add\.ts \(time budget\)/)
    const ts = loadTypeScript(process.cwd())
    const capped = buildDiffReport(
      CHANGE,
      DIFF,
      content({ 'src/add.ts': BEFORE }, { 'src/add.ts': AFTER }),
      {
        analyzers: [createTypescriptAnalyzer(ts)],
        maxMovers: 0,
      },
    )
    expect(capped.complexity.movers).toEqual([])
  })

  test('symlinks and submodules are non-text and carry no kinds', () => {
    const diff = [
      'diff --git a/link.ts b/link.ts\nnew file mode 120000\n--- /dev/null\n+++ b/link.ts\n@@ -0,0 +1 @@\n+a.ts\n',
      'diff --git a/sm b/sm\nindex 1111111..2222222 160000\n--- a/sm\n+++ b/sm\n@@ -1 +1 @@\n-Subproject commit 1111111\n+Subproject commit 2222222\n',
    ].join('')
    const r = buildDiffReport(CHANGE, diff, content({}, {}))
    expect(r.fileList.map((f) => [f.entry, f.category, f.kindOperations])).toEqual([
      ['symlink', 'non-text', null],
      ['submodule', 'non-text', null],
    ])
    expect(r.notes).toEqual([])
  })

  test("a failed scanner's kinds are noted as read by the table", () => {
    const registry = createScannerRegistry({
      scanners: [
        {
          id: 'broken',
          language: 'Broken',
          matches: () => true,
          scan: () => {
            throw new Error('boom')
          },
        },
      ],
    })
    const r = buildDiffReport(
      CHANGE,
      DIFF,
      content({ 'src/add.ts': BEFORE }, { 'src/add.ts': AFTER }),
      { registry },
    )
    expect(r.notes[0]).toBe(
      'kinds for 1 file(s) come from the built-in language table, because their scanner failed: src/add.ts',
    )
  })

  test('files only an unavailable analyzer matches are noted as unscored, naming it', () => {
    const analyzer = (id: string, available: boolean, ext: string): Analyzer => ({
      id,
      available: () => available,
      matches: (path) => path.endsWith(ext),
      analyze: () => new Map(),
    })
    const files = content({ 'src/add.ts': BEFORE }, { 'src/add.ts': AFTER })
    const unscored = buildDiffReport(CHANGE, DIFF, files, {
      analyzers: [analyzer('ok', true, '.rs'), analyzer('absent', false, '.ts')],
    })
    expect(unscored.complexity.note).toBe(
      'files in languages with no available analyzer (absent) were not scored',
    )
    const covered = buildDiffReport(CHANGE, DIFF, files, {
      analyzers: [analyzer('ok', true, '.ts'), analyzer('absent', false, '.ts')],
    })
    expect(covered.complexity.note).toBeNull()
  })

  test('the API and complexity passes keep to their file cap', () => {
    const r = buildDiffReport(
      CHANGE,
      DIFF,
      content({ 'src/add.ts': BEFORE }, { 'src/add.ts': AFTER }),
      {
        maxAnalysisFiles: 0,
      },
    )
    expect(r.notes.join('\n')).toMatch(
      /skipped 1 file\(s\) in the API and complexity passes: src\/add\.ts \(file cap 0\)/,
    )
  })
})

describe('buildCountReport', () => {
  test('totals by kind, language and group; unread files are listed, not counted', () => {
    const r = buildCountReport(
      { label: 'HEAD', commit: 'c'.repeat(40) },
      [],
      [
        { path: 'src/a.ts', content: text("import x from 'x'\n\n// note\nx()\n") },
        { path: 'src/a.test.ts', content: text('test()\n') },
        { path: 'README.md', content: text('# Hi\n') },
        { path: 'bun.lock', content: text('{}\n{}\n') },
        { path: 'notes.unknownext', content: text('# c\nv\n') },
        { path: 'logo.png', content: { kind: 'binary', bytes: 10 } },
      ],
      { detail: true },
    )
    expect(countReportSchema.parse(r)).toEqual(r)
    expect(r.files).toBe(5)
    expect(r.lines).toBe(10)
    expect(r.kinds).toEqual({ logic: 3, boilerplate: 1, comment: 2, doc: 1, blank: 1 })
    expect(r.languages.map((l) => [l.language, l.files, l.lines])).toEqual([
      ['TypeScript', 2, 5],
      [null, 1, 2],
      ['Markdown', 1, 1],
    ])
    expect(r.groups.generated).toEqual({ files: 1, lines: 2, kinds: null })
    expect(r.groups.tests.kinds?.logic).toBe(1)
    expect(r.skipped).toEqual([{ path: 'logo.png', reason: 'binary' }])
    expect(r.fileList?.map((f) => f.path)).toEqual([
      'src/a.ts',
      'src/a.test.ts',
      'README.md',
      'bun.lock',
      'notes.unknownext',
    ])
    expect(r.notes).toEqual([
      '1 file(s) of no known language were read with the one-line comment rule',
    ])
  })

  test('a failed scanner is noted with the reader that took over, its paths capped', () => {
    const failing = createScannerRegistry({
      scanners: [
        {
          id: 'broken',
          language: 'Broken',
          matches: () => true,
          scan: () => {
            throw new Error('boom')
          },
        },
      ],
    })
    const files = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.zz'].map((path) => ({
      path,
      content: text('x()\n'),
    }))
    const r = buildCountReport({ label: 'HEAD', commit: null }, [], files, { registry: failing })
    expect(r.notes).toEqual([
      'a scanner failed on 6 file(s), which the built-in language table read instead: ' +
        'a.ts (broken: Error: boom), b.ts (broken: Error: boom), c.ts (broken: Error: boom), ' +
        'd.ts (broken: Error: boom), e.ts (broken: Error: boom), and 1 more',
      'a scanner failed on 1 file(s), which the one-line comment rule read instead: ' +
        'g.zz (broken: Error: boom)',
    ])
  })

  test('generated and vendored files are counted by lines and never scanned', () => {
    const scanned: string[] = []
    const registry = createScannerRegistry({
      scanners: [
        {
          id: 'spy',
          language: 'Spy',
          matches: () => true,
          scan: (t, path) => {
            scanned.push(path)
            return splitLines(t).map(() => 'logic')
          },
        },
      ],
    })
    const r = buildCountReport(
      { label: 'HEAD', commit: null },
      [],
      [
        { path: 'src/a.ts', content: text('x()\n') },
        { path: 'bun.lock', content: text('{}\n{}\n') },
        { path: 'vendor/v.ts', content: text('a\nb\nc\n') },
      ],
      { registry, detail: true },
    )
    expect(scanned).toEqual(['src/a.ts'])
    expect(r.groups.generated).toEqual({ files: 1, lines: 2, kinds: null })
    expect(r.groups.vendored).toEqual({ files: 1, lines: 3, kinds: null })
    expect(r.fileList?.map((f) => [f.path, f.language])).toEqual([
      ['src/a.ts', 'TypeScript'],
      ['bun.lock', 'Spy'],
      ['vendor/v.ts', 'TypeScript'],
    ])
  })

  test('the file list is null unless asked for', () => {
    expect(buildCountReport({ label: 'worktree', commit: null }, [], []).fileList).toBeNull()
  })

  test('reads files from any iterable, one at a time, as it would from an array', () => {
    const files = [
      { path: 'a.ts', content: text('// a\nexport const a = 1\n') },
      { path: 'b.md', content: text('# B\n') },
      { path: 'c.bin', content: { kind: 'binary', bytes: 3 } as const },
    ]
    let held = 0
    let most = 0
    function* lazily() {
      for (const f of files) {
        held += 1
        most = Math.max(most, held)
        yield f
        held -= 1
      }
    }
    const source = { label: 'x', commit: null }
    expect(buildCountReport(source, [], lazily(), { detail: true })).toEqual(
      buildCountReport(source, [], files, { detail: true }),
    )
    expect(most).toBe(1)
  })
})
