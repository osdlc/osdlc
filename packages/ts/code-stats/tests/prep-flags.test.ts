import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'
import { EXIT, captureContext } from '@osdlc/cli-tool'

import { createMain } from '../src/cli/main.ts'
import { prepManifestSchema } from '../src/prep/schema.ts'
import { raiseFlags } from '../src/prep/flags/index.ts'
import { Checkout } from '../src/prep/checkout.ts'
import { DEFAULT_THRESHOLDS, runPrep } from '../src/prep/run.ts'
import { spawnRunner } from '@osdlc/command-seam'
import { Git } from '@osdlc/typed-git'
import { body, branchRepo, cleanupFixtures, prep } from './prep-helpers.ts'

afterEach(cleanupFixtures)

const main = createMain()

const kinds = (out: ReturnType<typeof prep>) => out.flags.map((f) => [f.kind, f.path])

describe('long-function', () => {
  test('flags a mostly-added function at the threshold, with measurements and its group', () => {
    const { fx } = branchRepo(
      { 'src/keep.ts': 'export const k = 1\n' },
      { 'src/long.ts': body(88) },
    )
    const out = prep(fx)
    // 88 body lines + signature + closing brace = 90 lines.
    const flag = out.flags.find((f) => f.kind === 'long-function')!
    expect(flag).toMatchObject({
      basis: 'measured',
      path: 'src/long.ts',
      line: 1,
      group: out.groups.find((g) => g.files.includes('src/long.ts'))!.id,
      measurements: { name: 'fn', lines: 90, addedShare: 1 },
    })
    expect(out.thresholds).toMatchObject({ longFunctionLines: 90, longFunctionAddedShare: 0.5 })
  })

  test('build output and fixtures are not flagged', () => {
    const { fx } = branchRepo(
      { 'src/keep.ts': 'export const k = 1\n' },
      {
        'dist/long.js': body(88),
        'pkg/fixtures/long.ts': body(88),
        'vendored/long.ts': body(88),
        'src/long.ts': body(88),
      },
    )
    expect(kinds(prep(fx))).toEqual([['long-function', 'src/long.ts']])
  })

  test('near misses: one line short, and long but mostly old', () => {
    const old = body(97)
    const edited = old
      .replace('const v0 = 0', 'const v0 = 100')
      .replace('const v1 = 1', 'const v1 = 101')
    const { fx } = branchRepo(
      { 'src/old.ts': old },
      { 'src/short.ts': body(87), 'src/old.ts': edited },
    )
    expect(kinds(prep(fx)).filter(([k]) => k === 'long-function')).toEqual([])
    // The same file, once the threshold is lowered, shows the thresholds are parameters.
    const low = prep(fx, { thresholds: { longFunctionLines: 80 } })
    expect(kinds(low).filter(([k]) => k === 'long-function')).toEqual([
      ['long-function', 'src/short.ts'],
    ])
    expect(low.thresholds.longFunctionLines).toBe(80)
  })
})

describe('test-only-export', () => {
  const util = (extra: string) => `export const kept = 1\n${extra}`
  const files = (extra: string) => ({
    'src/util.ts': util(extra),
    'src/app.ts': "import { kept, used } from './util.js'\nexport const a = kept + used()\n",
    'tests/util.test.ts':
      "import { helperForTest, used } from '../src/util.ts'\nhelperForTest(); used()\n",
  })

  test('flags an added export that only tests import', () => {
    const { fx } = branchRepo(
      {
        'src/util.ts': util(''),
        'src/app.ts': "import { kept } from './util.js'\nexport const a = kept\n",
      },
      files('export function helperForTest() {}\nexport function used() {}\n'),
    )
    const out = prep(fx)
    const flags = out.flags.filter((f) => f.kind === 'test-only-export')
    expect(flags).toHaveLength(1)
    expect(flags[0]).toMatchObject({
      basis: 'heuristic',
      path: 'src/util.ts',
      line: 2,
      measurements: { name: 'helperForTest', importers: ['tests/util.test.ts'] },
    })
  })

  test('near misses: also used by source, never imported, or not added by this change', () => {
    const { fx } = branchRepo(
      {
        'src/util.ts': util('export function old() {}\n'),
        'tests/old.test.ts': "import { old } from '../src/util.ts'\nold()\n",
      },
      {
        ...files(
          'export function old() {}\nexport function helperForTest() {}\nexport function used() {}\n',
        ),
        // helperForTest is now imported by source too.
        'src/more.ts': "import { helperForTest } from './util.ts'\nhelperForTest()\n",
        'src/lonely.ts': 'export function nobody() {}\n',
      },
    )
    expect(prep(fx).flags.filter((f) => f.kind === 'test-only-export')).toEqual([])
  })

  const testOnly = (out: ReturnType<typeof prep>) =>
    out.flags.filter((f) => f.kind === 'test-only-export')

  test('lines are counted as git counts them: a U+2028 above the export does not shift it', () => {
    const mod = '// sep: \u2028 here\nexport const keep = 1\n'
    const { fx } = branchRepo(
      { 'src/mod.ts': mod, 'src/mod.test.ts': "import { helper } from './mod'\nhelper()\n" },
      { 'src/mod.ts': `${mod}export function helper() { return 1 }\n` },
    )
    expect(testOnly(prep(fx))).toMatchObject([{ line: 3, measurements: { name: 'helper' } }])
  })

  test('an export a Vue component imports is not test-only', () => {
    const { fx } = branchRepo(
      { 'src/util.ts': 'export const kept = 1\n' },
      {
        'src/util.ts': 'export const kept = 1\nexport function format() { return 1 }\n',
        'src/App.vue':
          '<template><p>{{ format() }}</p></template>\n<script setup lang="ts">\nimport { format } from \'./util\'\n</script>\n',
        'tests/util.test.ts': "import { format } from '../src/util'\nformat()\n",
      },
    )
    expect(testOnly(prep(fx))).toEqual([])
  })

  test('a component is read by its script blocks, not as one TS file', () => {
    // Read raw, the template's `/*` would open a comment that hides the import.
    const { fx } = branchRepo(
      { 'src/util.ts': 'export const kept = 1\n' },
      {
        'src/util.ts': 'export const kept = 1\nexport function format() { return 1 }\n',
        'src/Glob.vue':
          '<template><p>matches src/*.ts</p></template>\n<script setup lang="ts">\nimport { format } from \'./util\'\n</script>\n',
        'tests/util.test.ts': "import { format } from '../src/util'\nformat()\n",
      },
    )
    expect(testOnly(prep(fx))).toEqual([])
  })

  test('an overloaded export is flagged once', () => {
    const { fx } = branchRepo(
      { 'src/keep.ts': 'export const k = 1\n' },
      {
        'src/lib.ts':
          'export function f(a: string): string\nexport function f(a: number): number\nexport function f(a: any): any { return a }\n',
        'src/lib.test.ts': "import { f } from './lib'\nf(1)\n",
      },
    )
    expect(testOnly(prep(fx))).toMatchObject([{ line: 1, measurements: { name: 'f' } }])
  })

  test('editing an export that already existed does not make it an added export', () => {
    const { fx } = branchRepo(
      {
        'src/util.ts': 'export function old(a: number) { return a }\n',
        'tests/util.test.ts': "import { old } from '../src/util'\nold(1)\n",
      },
      { 'src/util.ts': 'export function old(a: number, b = 0) { return a + b }\n' },
    )
    expect(testOnly(prep(fx))).toEqual([])
  })
})

describe('manifest and CLI', () => {
  test('the output validates against the exported schema and round-trips as JSON', () => {
    const { fx } = branchRepo({}, { 'src/a.ts': 'export const a = 1\n', 'bun.lock': 'x\n' })
    const out = prep(fx)
    expect(prepManifestSchema.parse(JSON.parse(JSON.stringify(out)))).toEqual(out)
    expect(prepManifestSchema.safeParse({ ...out, schema: 1 }).success).toBe(false)
    expect(out.change).toMatchObject({ kind: 'merge-base', label: 'main...HEAD', pr: null })
    expect(out.change.head).toMatch(/^[0-9a-f]{40}$/)
  })

  test('code-stats prep prints one manifest; --group-size is read', async () => {
    const { fx } = branchRepo(
      {},
      { 'lib/a.ts': 'export const a = 1\n', 'lib/b.ts': 'export const b = 1\n' },
    )
    const ctx = captureContext({ cwd: fx.dir })
    const code = await main(['prep', '--base', 'main', '--group-size', '1'], ctx)
    expect(code).toBe(EXIT.ok)
    const out = prepManifestSchema.parse(JSON.parse(ctx.io.out))
    expect(out.groups.map((g) => g.files)).toEqual([['lib/a.ts'], ['lib/b.ts']])
  })

  test('usage errors and a bad revision exit 2', async () => {
    const { fx } = branchRepo({}, { 'a.ts': 'export const a = 1\n' })
    const run = async (...argv: string[]) => {
      const ctx = captureContext({ cwd: fx.dir })
      return [await main(['prep', ...argv], ctx), ctx.io.err] as const
    }
    expect((await run('--head', 'x'))[0]).toBe(EXIT.usage)
    expect((await run('nope'))[0]).toBe(EXIT.usage)
    expect((await run('--group-size=-1'))[0]).toBe(EXIT.usage)
    expect((await run('--since', 'x'))[0]).toBe(EXIT.usage)
    for (const flag of ['base', 'head']) {
      const [code, message] = await run('--base', 'main', `--${flag}=-x`)
      expect(code).toBe(EXIT.usage)
      expect(message).toContain(`--${flag} must not start with '-'`)
    }
    const [bad, err] = await run('--base', 'no-such-ref')
    expect(bad).toBe(EXIT.usage)
    expect(err).toContain('no-such-ref')
  })
})

describe('a PR', () => {
  test('whose commits are not in the checkout is an error that says how to get them', () => {
    const { fx } = branchRepo({}, { 'a.ts': 'export const a = 1\n' })
    const gh = {
      binary: 'gh',
      run: () => ({
        exitCode: 0,
        stdout: JSON.stringify({ baseRefOid: 'a'.repeat(40), headRefOid: 'b'.repeat(40) }),
        stderr: '',
      }),
    }
    expect(() =>
      runPrep({ cwd: fx.dir, pr: 7, base: null }, { git: spawnRunner('git'), gh }),
    ).toThrow(/PR #7 are not in this checkout; run `gh pr checkout 7`/)
  })

  test('and --base together are a usage error', () => {
    expect(() =>
      runPrep(
        { cwd: '.', pr: 7, base: 'main' },
        { git: spawnRunner('git'), gh: spawnRunner('gh') },
      ),
    ).toThrow(expect.objectContaining({ kind: 'bad-input' }))
  })
})

describe('flags are optional', () => {
  test('a failure while computing flags becomes a note, not a crash', () => {
    const { fx } = branchRepo({}, { 'src/a.ts': body(100) })
    const out = raiseFlags({
      thresholds: DEFAULT_THRESHOLDS,
      checkout: new Checkout(fx.dir, new Git(fx.dir, { runner: spawnRunner('git') })),
      kept: [
        {
          path: 'src/a.ts',
          status: 'added',
          group: 'source',
          category: 'added',
          language: 'TypeScript',
          added: 102,
          removed: 0,
        },
      ],
      addedAt: new Map([['src/a.ts', [1, 2, 3]]]),
      groupOf: new Map(),
      readHead: () => {
        throw new Error('boom')
      },
      readBase: () => null,
      tooLarge: new Set(),
    })
    expect(out.flags).toEqual([])
    expect(out.notes).toEqual([expect.stringContaining('boom')])
  })

  test('a source too large to read is named in a note', () => {
    const big = `${body(10)}// ${'x'.repeat(2_000_001)}\n`
    const { fx } = branchRepo({}, { 'src/big.ts': big, 'src/a.ts': body(100) })
    const out = prep(fx)
    expect(kinds(out)).toEqual([['long-function', 'src/a.ts']])
    expect(out.notes).toEqual([expect.stringMatching(/too large to read.*: src\/big\.ts$/)])
  })

  test('--group-size takes digits only', async () => {
    const { fx } = branchRepo({}, { 'a.ts': 'export const a = 1\n' })
    for (const bad of ['', '0x10', '1e1', ' 5', '-1']) {
      const ctx = captureContext({ cwd: fx.dir })
      expect(await main(['prep', '--base', 'main', `--group-size=${bad}`], ctx)).toBe(EXIT.usage)
    }
  })

  test('a repo with neither origin/HEAD nor origin/main is an error that names them', async () => {
    const { fx } = branchRepo({}, { 'a.ts': 'export const a = 1\n' })
    const ctx = captureContext({ cwd: fx.dir })
    expect(await main(['prep'], ctx)).toBe(EXIT.error)
    expect(ctx.io.err).toContain('origin/HEAD')
  })
})

describe('symlinks', () => {
  test('a symlink in the checkout is not read, so it names no importer', () => {
    // The file outside the repository imports the new export; a followed link
    // would make the export look test-only.
    const outside = mkdtempSync(join(tmpdir(), 'code-stats-outside-'))
    try {
      writeFileSync(join(outside, 'link.test.ts'), "import { helper } from './mod'\nhelper()\n")
      const { fx } = branchRepo(
        { 'src/mod.ts': 'export const keep = 1\n' },
        { 'src/mod.ts': 'export const keep = 1\nexport function helper() { return 1 }\n' },
      )
      mkdirSync(join(fx.dir, 'tests'))
      symlinkSync(join(outside, 'link.test.ts'), join(fx.dir, 'tests', 'link.test.ts'))
      const checkout = new Checkout(fx.dir, new Git(fx.dir, { runner: spawnRunner('git') }))
      expect(checkout.files).toContain('tests/link.test.ts')
      expect(checkout.read('tests/link.test.ts')).toBeNull()
      expect(prep(fx).flags).toEqual([])
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  test('a file behind a linked directory that leaves the repository is not read', () => {
    const outside = mkdtempSync(join(tmpdir(), 'code-stats-outside-'))
    try {
      writeFileSync(join(outside, 'dir.test.ts'), "import { helper } from '../src/mod'\nhelper()\n")
      const { fx } = branchRepo(
        { 'src/mod.ts': 'export const keep = 1\n', 'tests/dir.test.ts': 'export {}\n' },
        { 'src/mod.ts': 'export const keep = 1\nexport function helper() { return 1 }\n' },
      )
      rmSync(join(fx.dir, 'tests'), { recursive: true })
      symlinkSync(outside, join(fx.dir, 'tests'))
      const checkout = new Checkout(fx.dir, new Git(fx.dir, { runner: spawnRunner('git') }))
      expect(checkout.read('tests/dir.test.ts')).toBeNull()
      expect(prep(fx).flags).toEqual([])
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  test('a file behind a linked directory that stays inside the repository is read', () => {
    const { fx } = branchRepo({}, { 'real/a.ts': 'export const a = 1\n' })
    symlinkSync(join(fx.dir, 'real'), join(fx.dir, 'alias'))
    const checkout = new Checkout(fx.dir, new Git(fx.dir, { runner: spawnRunner('git') }))
    expect(checkout.read('alias/a.ts')).toBe('export const a = 1\n')
  })

  test('a regular file is read', () => {
    const { fx } = branchRepo({}, { 'src/a.ts': 'export const a = 1\n' })
    const checkout = new Checkout(fx.dir, new Git(fx.dir, { runner: spawnRunner('git') }))
    expect(checkout.read('src/a.ts')).toBe('export const a = 1\n')
    expect(checkout.read('src/missing.ts')).toBeNull()
  })

  test('a checkout given as a relative path is read', () => {
    const { fx } = branchRepo({}, { 'src/a.ts': 'export const a = 1\n' })
    const cwd = relative(process.cwd(), fx.dir)
    const checkout = new Checkout(cwd, new Git(fx.dir, { runner: spawnRunner('git') }))
    expect(checkout.read('src/a.ts')).toBe('export const a = 1\n')
  })
})
