/**
 * The examples in README.md and docs/guide/, run as written, so the guides
 * cannot drift from what the code does.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import {
  CodeStatsError,
  assignOperations,
  buildCountReport,
  countDirectory,
  countTree,
  describeChange,
  diffChange,
  parseChangeSpec,
  parseDiff,
  renderCount,
  renderDiff,
} from '@osdlc/code-stats'
import {
  countKinds,
  createScannerRegistry,
  splitLines,
  type LanguageScanner,
} from '@osdlc/code-stats/scan'

const made: string[] = []
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** A throwaway repository on branch `main`; `commit` writes files and commits them. */
function testRepo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'code-stats-guide-')))
  made.push(dir)
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.name=Example', '-c', 'user.email=example@example.invalid', ...args],
      {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
      },
    ).trim()
  git('init', '-q', '-b', 'main')
  return {
    dir,
    git,
    commit(message: string, files: Record<string, string> = {}) {
      for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, path)), { recursive: true })
        writeFileSync(join(dir, path), content)
      }
      git('add', '-A')
      git('commit', '-q', '--allow-empty', '-m', message)
    },
  }
}

function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'code-stats-guide-'))
  made.push(dir)
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  return dir
}

const labelled = (text: string, path: string) => {
  const kinds = createScannerRegistry().scan(text, path).kinds
  return splitLines(text).map((line, i) => `${kinds[i]!.padEnd(11)} │ ${line}`.trimEnd())
}

const CART_BEFORE = `import { round } from './money.ts'

/** A line in the cart. */
export interface Item {
  price: number
  qty: number
}

// Sum before tax.
export function subtotal(items: Item[]): number {
  return round(items.reduce((n, i) => n + i.price * i.qty, 0))
}

export function isEmpty(items: Item[]): boolean {
  return items.length === 0 || items.every((item) => item.qty === 0)
}
`

const CART_AFTER = `import { round } from './money.ts'
import { TAX_RATE } from './tax.ts'

/** A line in the cart. */
export interface Item {
  price: number
  quantity: number
}

export function isEmpty(items: Item[]): boolean {
  return items.length === 0 || items.every((item) => item.qty === 0)
}

// Sum before tax, in whole cents.
export function subtotal(items: Item[]): number {
  return round(items.reduce((n, i) => n + i.price * i.quantity, 0))
}

/** The total a customer pays. */
export function total(items: Item[]): number {
  return round(subtotal(items) * (1 + TAX_RATE))
}
`

const SHOP = {
  'package.json': '{ "name": "shop", "version": "1.0.0", "dependencies": { "zod": "^4.0.0" } }\n',
  'README.md': '# Shop\n\nPrices, carts and totals.\n',
  'src/money.ts':
    '/** Rounds to whole cents. */\nexport function round(amount: number): number {\n  return Math.round(amount * 100) / 100\n}\n',
  'src/cart.ts': CART_BEFORE,
}

describe('README', () => {
  test('the labelled lines at the top', () => {
    const text = [
      "import { round } from './money.ts'",
      '',
      '/** The total a customer pays. */',
      'export function total(items: Item[]): number {',
      '  if (isEmpty(items)) return 0',
      '  // Tax applies after rounding.',
      '  return round(subtotal(items) * (1 + TAX_RATE))',
      '}',
    ].join('\n')
    expect(labelled(text, 'cart.ts')).toEqual([
      "boilerplate │ import { round } from './money.ts'",
      'blank       │',
      'doc         │ /** The total a customer pays. */',
      'logic       │ export function total(items: Item[]): number {',
      'logic       │   if (isEmpty(items)) return 0',
      'comment     │   // Tax applies after rounding.',
      'logic       │   return round(subtotal(items) * (1 + TAX_RATE))',
      'boilerplate │ }',
    ])
  })

  test('code-stats count on a small project', () => {
    const out = renderCount(countDirectory({ dir: folder(SHOP) }))
    expect(out).toContain('| TypeScript | 2 | 9 | 5 | 1 | 2 | 3 | 20 |')
    expect(out).toContain('| Markdown | 1 | 0 | 0 | 0 | 2 | 1 | 3 |')
    expect(out).toContain('| JSON | 1 | 1 | 0 | 0 | 0 | 0 | 1 |')
    expect(out).toContain('| **Total** | **4** | **10** | **5** | **1** | **4** | **4** | **24** |')
  })
})

test('counting.md: the labelled file', () => {
  expect(labelled(CART_AFTER, 'src/cart.ts').slice(0, 17)).toEqual([
    "boilerplate │ import { round } from './money.ts'",
    "boilerplate │ import { TAX_RATE } from './tax.ts'",
    'blank       │',
    'doc         │ /** A line in the cart. */',
    'logic       │ export interface Item {',
    'logic       │   price: number',
    'logic       │   quantity: number',
    'boilerplate │ }',
    'blank       │',
    'logic       │ export function isEmpty(items: Item[]): boolean {',
    'logic       │   return items.length === 0 || items.every((item) => item.qty === 0)',
    'boilerplate │ }',
    'blank       │',
    'comment     │ // Sum before tax, in whole cents.',
    'logic       │ export function subtotal(items: Item[]): number {',
    'logic       │   return round(items.reduce((n, i) => n + i.price * i.quantity, 0))',
    'boilerplate │ }',
  ])
})

describe('changes.md: the worked example', () => {
  function shop() {
    const r = testRepo()
    r.commit('base', SHOP)
    r.git('switch', '-q', '-c', 'feature')
    r.commit('feature', {
      'src/cart.ts': CART_AFTER,
      'src/tax.ts': '/** Sales tax, as a fraction. */\nexport const TAX_RATE = 0.08\n',
    })
    return r
  }

  test('what happened to each line', () => {
    const r = shop()
    const files = parseDiff(
      r.git('diff', '-U0', '-M', '--no-color', 'main...feature', '--', 'src/cart.ts'),
    )
    const [ops] = assignOperations(files)
    const f = files[0]!
    const lines = [
      ...f.removed.map((l, i) => `- ${ops!.removed[i]!.padEnd(7)} │ ${l.text}`.trimEnd()),
      ...f.added.map((l, i) => `+ ${ops!.added[i]!.padEnd(7)} │ ${l.text}`.trimEnd()),
    ]
    expect(lines).toEqual([
      '- changed │   qty: number',
      '- changed │ // Sum before tax.',
      '- changed │   return round(items.reduce((n, i) => n + i.price * i.qty, 0))',
      '- moved   │ export function isEmpty(items: Item[]): boolean {',
      '- moved   │   return items.length === 0 || items.every((item) => item.qty === 0)',
      "+ added   │ import { TAX_RATE } from './tax.ts'",
      '+ changed │   quantity: number',
      '+ moved   │ export function isEmpty(items: Item[]): boolean {',
      '+ moved   │   return items.length === 0 || items.every((item) => item.qty === 0)',
      '+ added   │ }',
      '+ added   │',
      '+ changed │ // Sum before tax, in whole cents.',
      '+ changed │   return round(items.reduce((n, i) => n + i.price * i.quantity, 0))',
      '+ added   │ /** The total a customer pays. */',
      '+ added   │ export function total(items: Item[]): number {',
      '+ added   │   return round(subtotal(items) * (1 + TAX_RATE))',
    ])
  })

  test('moved and edited: the edited line pairs with its edit', () => {
    const r = testRepo()
    r.commit('base', { 'src/cart.ts': CART_BEFORE })
    r.commit('edit', {
      'src/cart.ts': CART_BEFORE.replace(/\nexport function isEmpty[\s\S]*$/, '').replace(
        'export interface Item',
        `export function isEmpty(items: Item[]): boolean {
  return items.length === 0 || items.every((item) => item.quantity === 0)
}

export interface Item`,
      ),
    })
    const files = parseDiff(r.git('diff', '-U0', '-M', '--no-color', 'HEAD~1', 'HEAD'))
    const [ops] = assignOperations(files)
    const f = files[0]!
    const lines = [
      ...f.removed.map((l, i) => `- ${ops!.removed[i]!.padEnd(7)} │ ${l.text}`),
      ...f.added.map((l, i) => `+ ${ops!.added[i]!.padEnd(7)} │ ${l.text}`),
    ].filter((l) => l.includes('isEmpty') || l.includes('items.every'))
    expect(lines).toEqual([
      '- moved   │ export function isEmpty(items: Item[]): boolean {',
      '- changed │   return items.length === 0 || items.every((item) => item.qty === 0)',
      '+ moved   │ export function isEmpty(items: Item[]): boolean {',
      '+ changed │   return items.length === 0 || items.every((item) => item.quantity === 0)',
    ])
  })

  test('the diff table, and the API it reports', () => {
    const r = shop()
    const report = diffChange(parseChangeSpec('main...feature'), { cwd: r.dir })
    const table = renderDiff(report)
    for (const row of [
      '| Logic | 3 | 2 | 2 | 0 | +3 |',
      '| Boilerplate | 2 | 0 | 0 | 0 | +2 |',
      '| Comments | 0 | 1 | 0 | 0 | 0 |',
      '| Docs | 2 | 0 | 0 | 0 | +2 |',
      '| Blank | 1 | 0 | 0 | 0 | +1 |',
      '| **Total** | **8** | **3** | **2** | **0** | **+8** |',
    ]) {
      expect(table).toContain(row)
    }
    expect(table).toContain('`src/cart.ts`: +`total` `Item.quantity` -`Item.qty`')
    expect(report.kindOperations.logic).toEqual({ added: 3, removed: 0, changed: 2, moved: 2 })
  })
})

test('pr-descriptions.md: the package map and risk list', async () => {
  const r = testRepo()
  r.commit('base', {
    'packages/money/package.json': '{"name":"@shop/money"}\n',
    'packages/cart/package.json':
      '{"name":"@shop/cart","dependencies":{"@shop/money":"workspace:*"}}\n',
    'packages/web/package.json':
      '{"name":"@shop/web","dependencies":{"@shop/cart":"workspace:*"}}\n',
    'packages/money/src/index.ts':
      'export function round(n: number): number {\n  return Math.round(n * 100) / 100\n}\n',
    'packages/cart/src/index.ts':
      "import { round } from '@shop/money'\nexport const total = (n: number) => round(n)\n",
    'packages/web/src/main.ts': "import { total } from '@shop/cart'\nconsole.log(total(1))\n",
  })
  r.git('switch', '-q', '-c', 'feature')
  r.commit('change', {
    'packages/money/src/index.ts':
      'export function round(n: number, places = 2): number {\n  const f = 10 ** places\n  return Math.round(n * f) / f\n}\n',
  })
  const d = await describeChange(parseChangeSpec('main...feature'), { cwd: r.dir })
  expect(d.markdown).toContain(
    [
      '```mermaid',
      'flowchart LR',
      '  p0["@shop/money<br/>+3 −2"]:::changed',
      '  p1["@shop/cart<br/>depends on it"]:::affected',
      '  p1 --> p0',
    ].join('\n'),
  )
  expect(d.markdown).toContain('| `@shop/money` | `packages/money` | 1 | 3 | 2 | 3 |')
  expect(d.markdown).toContain(
    '- Exported API removed or changed in 1 file(s), 1 of them a package entry point: `packages/money/src/index.ts`\n' +
      '- Source logic changed (3 lines) with no test file changed',
  )
})

describe('library.md', () => {
  test('label the lines of a string', () => {
    const source = [
      "import { readFile } from 'node:fs/promises'",
      '',
      '/** Reads it. */',
      "export const read = (p: string) => readFile(p, 'utf8') // utf-8",
    ].join('\n')
    const scan = createScannerRegistry().scan(source, 'src/read.ts')
    expect(scan.name).toBe('TypeScript')
    expect(scan.kinds).toEqual(['boilerplate', 'blank', 'doc', 'logic'])
    expect(countKinds(scan.kinds)).toEqual({
      logic: 1,
      boilerplate: 1,
      comment: 0,
      doc: 1,
      blank: 1,
    })
    expect(scan.fallback).toBeNull()
  })

  test('count a folder, with a scanner added for SQL', () => {
    const dir = folder({
      'src/a.sql': '-- totals\nselect 1;\n',
      'src/b.ts': 'export const b = 1\n',
    })
    const sql: LanguageScanner = {
      id: 'my-sql',
      language: 'SQL',
      matches: (path) => path.endsWith('.sql'),
      scan: (text) =>
        text.split('\n').map((line) => (line.trim().startsWith('--') ? 'comment' : 'logic')),
    }
    const registry = createScannerRegistry({ scanners: [sql] })
    const report = countDirectory({ dir, paths: ['src'], registry, detail: true })
    expect(report.files).toBe(2)
    expect(report.fileList?.find((f) => f.path === 'src/a.sql')).toMatchObject({ language: 'SQL' })
    expect(report.kinds.comment).toBe(1)
  })

  test('use your own file contents', () => {
    const report = buildCountReport(
      { label: 'upload', commit: null },
      [],
      [
        { path: 'a.py', content: { kind: 'text', text: 'import os\nprint(os.name)\n' } },
        { path: 'logo.png', content: { kind: 'binary', bytes: 2048 } },
      ],
    )
    expect(report.files).toBe(1)
    expect(report.skipped).toEqual([{ path: 'logo.png', reason: 'binary' }])
    expect(report.kinds).toMatchObject({ boilerplate: 1, logic: 1 })
  })

  test('errors: fall back to counting the directory when there is no repository', () => {
    const dir = folder({ 'a.ts': 'export const a = 1\n' })
    const count = (cwd: string) => {
      try {
        return countTree({ cwd })
      } catch (e) {
        if (e instanceof CodeStatsError && e.kind === 'needs-git')
          return countDirectory({ dir: cwd })
        throw e
      }
    }
    expect(count(dir).source.label).toBe('files on disk')
    expect(() => countTree({ cwd: dir })).toThrow(CodeStatsError)
  })
})
