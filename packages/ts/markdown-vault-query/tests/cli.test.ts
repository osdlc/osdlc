/**
 * The `markdown-vault-query` command line: `main` runs in process, so the exit code is its return
 * value and the output is what it prints. `tests/smoke.mjs` runs the built binary.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, test, vi } from 'vitest'

import { main } from '../src/cli.ts'

const SCRATCH = mkdtempSync(join(tmpdir(), 'markdown-vault-query-cli-'))
const BASIC_VAULT = fileURLToPath(new URL('./fixtures/basic-vault', import.meta.url))
const PLANNING_VAULT = fileURLToPath(new URL('./fixtures/planning-vault', import.meta.url))

afterEach(() => {
  vi.restoreAllMocks()
})

/** Run `main` with the console captured. */
async function run(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = []
  const err: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void err.push(a.join(' ')))
  const code = await main(argv)
  return { code, out: out.join('\n'), err: err.join('\n') }
}

describe('markdown-vault-query cli', () => {
  test('--help after a command prints usage and exits 0', async () => {
    const r = await run('check', 'a.base', '--help')
    expect(r.code).toBe(0)
    expect(r.out).toContain('Usage:')
  })

  test('a command missing its argument prints usage and exits 1', async () => {
    const r = await run('check')
    expect(r.code).toBe(1)
    expect(r.err).toContain('Usage:')
    expect(r.out).toBe('')
    expect((await run()).code).toBe(1)
    expect((await run('bogus')).code).toBe(1)
  })

  test('a thrown error prints the bare message and exits 1', async () => {
    const r = await run('views', join(SCRATCH, 'missing.base'))
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/^ENOENT: no such file or directory/)
  })

  test('query on a view with no order shows each file name in the fallback column', async () => {
    const base = join(SCRATCH, 'no-order.base')
    writeFileSync(base, 'views:\n  - type: table\n    name: All\n')
    const table = await run('query', base, '--vault', BASIC_VAULT)
    expect(table.code).toBe(0)
    expect(table.out).toContain('note-1.md')

    const json = await run('query', base, '--vault', BASIC_VAULT, '--json')
    expect(json.code).toBe(0)
    const rows = (JSON.parse(json.out) as { rows: Array<{ columns: Record<string, unknown> }> })
      .rows
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.map((r) => r.columns['file.name'])).toContain('note-1.md')
    expect(rows.every((r) => typeof r.columns['file.name'] === 'string')).toBe(true)
  })

  test('check prints ok or FAIL for each file and exits 1 when any fails', async () => {
    const good = join(SCRATCH, 'good.base')
    const bad = join(SCRATCH, 'bad.base')
    writeFileSync(good, 'views:\n  - type: table\n    name: One\n  - type: list\n    name: Two\n')
    writeFileSync(bad, 'formulas:\n  total: price *\n')

    const ok = await run('check', good)
    expect(ok.code).toBe(0)
    expect(ok.out).toBe(`ok   ${good} (2 views)`)

    const mixed = await run('check', good, bad)
    expect(mixed.code).toBe(1)
    expect(mixed.out).toContain(`ok   ${good}`)
    expect(mixed.err).toContain(`FAIL ${bad}: Invalid formula expression at formulas.total`)
  })

  test('views lists the type and name of each view', async () => {
    const base = join(PLANNING_VAULT, 'planning/tasks/tasks.base')
    const r = await run('views', base)
    expect(r.code).toBe(0)
    expect(r.out).toBe('table\tAll tasks')
  })

  test('views reports an invalid base like query does', async () => {
    const base = join(SCRATCH, 'invalid-views.base')
    writeFileSync(base, 'views: nope\n')
    const r = await run('views', base)
    expect(r.code).toBe(1)
    expect(r.err).toContain('Invalid base file: "views" must be a list at views')
  })

  test('--help prints usage on stdout', async () => {
    const r = await run('--help')
    expect(r.code).toBe(0)
    expect(r.out).toContain('Usage:')
    expect(r.err).toBe('')
  })

  test('filter prints the matching paths, or JSON with --json', async () => {
    const plain = await run('filter', 'status == "closed/done"', '--vault', PLANNING_VAULT)
    expect(plain.code).toBe(0)
    expect(plain.out).toContain('planning/tasks/task-1-fix-lexer.md')
    expect(plain.err).toMatch(/\d+ of \d+ files matched/)

    const json = await run('filter', 'status == "closed/done"', '--vault', PLANNING_VAULT, '--json')
    expect(json.code).toBe(0)
    expect(JSON.parse(json.out)).toContain('planning/tasks/task-1-fix-lexer.md')
  })

  test('filter sets `this` from --this', async () => {
    const vault = join(SCRATCH, 'filter-this-vault')
    mkdirSync(vault, { recursive: true })
    writeFileSync(join(vault, 'a.md'), '# A\n')
    writeFileSync(join(vault, 'b.md'), '# B\n')
    const expression = 'file.path == this.file.path'

    const withThis = await run('filter', expression, '--vault', vault, '--this', 'a.md', '--json')
    expect(withThis.code).toBe(0)
    expect(JSON.parse(withThis.out)).toEqual(['a.md'])

    // Without --this, `this` is unset and no note matches.
    const without = await run('filter', expression, '--vault', vault, '--json')
    expect(without.code).toBe(0)
    expect(JSON.parse(without.out)).toEqual([])
  })

  test('filter without an expression prints usage and exits 1', async () => {
    const r = await run('filter')
    expect(r.code).toBe(1)
    expect(r.err).toContain('Usage:')
  })

  test('an unknown option exits 1 with one line on stderr', async () => {
    const base = join(SCRATCH, 'known.base')
    writeFileSync(base, 'views:\n  - type: table\n    name: All\n')
    const r = await run('query', base, '--bogus', '--vault', BASIC_VAULT)
    expect(r.code).toBe(1)
    expect(r.err).toBe('Unknown option --bogus. Put an argument that starts with "-" after "--".')
    expect(r.out).toBe('')
    expect((await run('filter', 'true', '--vualt', BASIC_VAULT)).err).toMatch(
      /^Unknown option --vualt\./,
    )
  })

  test('an expression that starts with - is read after --', async () => {
    const refused = await run('filter', '-1 < 0', '--vault', BASIC_VAULT)
    expect(refused.code).toBe(1)
    expect(refused.err).toMatch(/^Unknown option -1 < 0\./)

    const read = await run('filter', '--vault', BASIC_VAULT, '--json', '--', '-1 < 0')
    expect(read.code).toBe(0)
    expect((JSON.parse(read.out) as string[]).length).toBeGreaterThan(0)
  })

  test.each(['--vault', '--view', '--this'])('%s with no value exits 1', async (flag) => {
    const base = join(SCRATCH, 'known.base')
    writeFileSync(base, 'views:\n  - type: table\n    name: All\n')
    const last = await run('query', base, flag)
    expect(last.code).toBe(1)
    expect(last.err).toBe(`${flag} needs a value`)
    expect((await run('query', base, flag, '--json')).err).toBe(`${flag} needs a value`)
  })

  test('--help wins over a bad option, and a single - or an argument after -- is positional', async () => {
    expect((await run('check', '--bogus', '--help')).code).toBe(0)
    const missing = join(SCRATCH, 'missing-after-separator.base')
    const r = await run('check', '--', missing)
    expect(r.code).toBe(1)
    expect(r.err).toContain(`FAIL ${missing}`)
    expect((await run('check', '-')).err).toContain('FAIL -')
  })

  test('query prints a table with the view columns and a row count', async () => {
    const base = join(PLANNING_VAULT, 'planning/tasks/tasks.base')
    const r = await run('query', base, '--vault', PLANNING_VAULT)
    expect(r.code).toBe(0)
    expect(r.out).toContain('status')
    expect(r.out).toContain('task-1-fix-lexer.md')
    expect(r.err).toMatch(/3 rows \(of 3 matched/)
  })

  test('query --json lists the rows with their columns', async () => {
    const base = join(PLANNING_VAULT, 'planning/tasks/tasks.base')
    const r = await run('query', base, '--vault', PLANNING_VAULT, '--json')
    expect(r.code).toBe(0)
    const result = JSON.parse(r.out) as {
      view: string
      total: number
      rows: Array<{ path: string; columns: Record<string, unknown> }>
    }
    expect(result.view).toBe('All tasks')
    expect(result.total).toBe(3)
    const first = result.rows.find((row) => row.path.endsWith('task-1-fix-lexer.md'))
    expect(first?.columns['status']).toBe('closed/done')
  })

  test('query prints groups and summaries', async () => {
    const base = join(SCRATCH, 'grouped.base')
    writeFileSync(
      base,
      [
        'filters: file.inFolder("planning/tasks")',
        'views:',
        '  - type: table',
        '    name: By impact',
        '    order: [file.name, impact]',
        '    groupBy: impact',
        '    summaries:',
        '      impact: Filled',
      ].join('\n'),
    )
    const table = await run('query', base, '--vault', PLANNING_VAULT)
    expect(table.code).toBe(0)
    expect(table.out).toMatch(/== high \(\d+\) ==/)
    expect(table.out).toContain('Summaries:')
    expect(table.out).toMatch(/impact: \d+/)

    const json = await run('query', base, '--vault', PLANNING_VAULT, '--json')
    const result = JSON.parse(json.out) as {
      groups: Array<{ key: string; count: number }>
      summaries: Record<string, unknown>
    }
    expect(result.groups.map((g) => g.key)).toContain('high')
    expect(result.summaries['impact']).toBeGreaterThan(0)
  })

  test('query --view picks a view by name and an unknown name is an error', async () => {
    const base = join(SCRATCH, 'two-views.base')
    writeFileSync(
      base,
      'views:\n  - type: table\n    name: First\n  - type: table\n    name: Second\n',
    )
    const second = await run('query', base, '--vault', BASIC_VAULT, '--view', 'Second', '--json')
    expect((JSON.parse(second.out) as { view: string }).view).toBe('Second')

    const missing = await run('query', base, '--vault', BASIC_VAULT, '--view', 'Third')
    expect(missing.code).toBe(1)
    expect(missing.err).toContain('View "Third" not found; available: First, Second')
  })

  test('query reports an invalid base file and exits 1', async () => {
    const base = join(SCRATCH, 'invalid.base')
    writeFileSync(base, 'views: nope\n')
    const r = await run('query', base, '--vault', BASIC_VAULT)
    expect(r.code).toBe(1)
    expect(r.err).toContain('Invalid base file: "views" must be a list at views')
  })

  test('`this` defaults to the base file inside the vault, and --this overrides it', async () => {
    const vault = join(SCRATCH, 'this-vault')
    mkdirSync(vault, { recursive: true })
    writeFileSync(join(vault, 'a.md'), '# A\n')
    const base = join(vault, 'me.base')
    writeFileSync(base, 'views:\n  - type: table\n    name: Me\n    order: [this.file.path]\n')
    const thisPath = async (...args: string[]): Promise<unknown> => {
      const r = await run('query', base, '--vault', vault, '--json', ...args)
      expect(r.code).toBe(0)
      const rows = (JSON.parse(r.out) as { rows: Array<{ columns: Record<string, unknown> }> }).rows
      return rows[0]?.columns['this.file.path']
    }

    // The base file is a note of the vault, so `this` is that note.
    expect(await thisPath()).toBe('me.base')
    expect(await thisPath('--this', 'a.md')).toBe('a.md')

    // A base file outside the vault leaves `this` unset.
    const outside = join(SCRATCH, 'outside.base')
    writeFileSync(outside, 'views:\n  - type: table\n    name: Me\n    order: [this.file.path]\n')
    const r = await run('query', outside, '--vault', vault, '--json')
    const rows = (JSON.parse(r.out) as { rows: Array<{ columns: Record<string, unknown> }> }).rows
    expect(rows[0]?.columns['this.file.path']).toBe(null)
  })
})
