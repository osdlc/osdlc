import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { captureOutput } from './capture-output.ts'
import { fakeAgent, fakeClaude, withPath } from './fake-agent.ts'
import { alive, waitFor } from './process-helpers.ts'
import { makeRepo, writeFile as writeRepoFile } from './fixture-repo.ts'
import { main } from '../src/cli.ts'

/** Run the CLI with stdout/stderr captured. */
function run(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  return captureOutput(() => main(argv))
}

describe('rule-review argument handling', () => {
  test('--help prints usage to stdout and exits 0', async () => {
    const { code, out } = await run(['--help'])

    expect(code).toBe(0)
    expect(out).toContain('Usage: rule-review [options]')
    expect(out).toContain('--dry-run')
    expect(out).toContain('Exit codes')
  })

  test('an unknown option fails with a pointer to --help', async () => {
    const { code, err } = await run(['--bogus'])

    expect(code).toBe(2)
    expect(err).toContain("unknown option '--bogus'")
    expect(err).toContain('--help')
  })

  test('a flag missing its value is rejected, not silently swallowed', async () => {
    // Without the check, `--base --json` would take "--json" as the ref.
    const { code, err } = await run(['--base', '--json'])

    expect(code).toBe(2)
    expect(err).toContain('--base needs a value')
  })

  test('--severity rejects a level outside the enum', async () => {
    const { code, err } = await run(['--severity', 'nonsense'])

    expect(code).toBe(2)
    expect(err).toContain('violation, tension, drift')
  })

  test('--concurrency rejects a non-positive integer', async () => {
    expect((await run(['--concurrency', '0'])).code).toBe(2)
    expect((await run(['--concurrency', 'abc'])).code).toBe(2)
  })

  test('--concurrency and --max-files reject a value that is not a whole integer', async () => {
    // parseInt would read each of these as its leading digits. `-C /` and
    // `--dry-run` keep an accepted value from ever starting a real run.
    for (const v of ['1.5', '1e2', '12abc', '0x10']) {
      const c = await run(['--dry-run', '-C', '/', '--concurrency', v])
      expect(c.code).toBe(2)
      expect(c.err).toContain('--concurrency expects a positive integer')
      const m = await run(['--dry-run', '-C', '/', '--max-files', v])
      expect(m.code).toBe(2)
      expect(m.err).toContain('--max-files expects a non-negative integer')
    }
  })

  test('a -C directory that does not exist exits 24 (no repository), for rule-review and rule-review checks', async () => {
    const missing = join(tmpdir(), `rule-review-missing-${process.pid}-${Date.now()}`)

    const reviewed = await run(['-C', missing, '--dry-run'])
    expect(reviewed.code).toBe(24)
    expect(reviewed.err).toContain(`rule-review: ${missing}`)

    const checks = await run(['checks', 'chk', '-C', missing])
    expect(checks.code).toBe(24)
    expect(checks.err).toContain(`rule-review: ${missing}`)
  })

  test('--help wins over a flag that would fail, for both commands', async () => {
    // Commander checks values before it acts on help.
    for (const argv of [
      ['--help', '--base'],
      ['--help', '--severity', 'bogus'],
      ['checks', '--help', '--base'],
    ]) {
      const { code, out } = await run(argv)
      expect(code, argv.join(' ')).toBe(0)
      expect(out).toContain('Usage: rule-review')
    }
  })

  test('git that is not installed exits 22, not 24', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'rule-review-nogit-'))
    const path = process.env['PATH']
    process.env['PATH'] = empty
    try {
      const reviewed = await run(['-C', tmpdir(), '--dry-run', '--json'])
      expect(reviewed.code).toBe(22)
      expect(JSON.parse(reviewed.out)).toMatchObject({ kind: 'error', code: 'not-installed' })

      const checks = await run(['checks', 'chk', '-C', tmpdir()])
      expect(checks.code).toBe(22)
    } finally {
      process.env['PATH'] = path
      rmSync(empty, { recursive: true, force: true })
    }
  })

  test('the error document stays valid JSON and free of controls when the message quotes them', async () => {
    // U+009D opens an 8-bit OSC string; stripped after serializing, it would
    // swallow the rest of the document. ESC would survive as the text \u001b.
    for (const bad of ['\u009dx', '\u001b[31mx']) {
      const missing = join(tmpdir(), `rule-review-${bad}`)
      const { code, out } = await run(['-C', missing, '--json'])

      expect(code).toBe(24)
      const doc = JSON.parse(out) as { message: string }
      expect(doc.message).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/)
    }
  })

  test('a directory outside a git repo exits 24 (no repository)', async () => {
    const { code, err } = await run(['-C', '/'])

    expect(code).toBe(24)
    expect(err).toContain('not inside a git repository')
  })

  test('under --json a failure prints the error document on stdout', async () => {
    const outside = await run(['-C', '/', '--json'])
    expect(outside.code).toBe(24)
    expect(JSON.parse(outside.out)).toEqual({
      schemaVersion: 1,
      kind: 'error',
      code: 'not-a-repository',
      message: '/ is not inside a git repository',
      exit: 24,
    })

    const typo = await run(['--json', '--bogus'])
    expect(typo.code).toBe(2)
    expect(JSON.parse(typo.out)).toMatchObject({ kind: 'error', code: 'usage', exit: 2 })
  })
})

describe('rule-review scope patterns', () => {
  test('an --exclude pattern the matcher rejects exits 10 with the reason on stderr', async () => {
    const { root } = makeRepo({ 'CLAUDE.md': 'Rule.\n', 'src/a.ts': 'a\n' })
    try {
      writeRepoFile(root, 'src/a.ts', 'a2\n')

      const { code, err } = await run(['-C', root, '--dry-run', '--exclude', '!(b).ts'])

      expect(code).toBe(10)
      expect(err).toContain('rule-review: exclude:')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('a plain --exclude drops the matching file from the plan', async () => {
    const { root } = makeRepo({ 'CLAUDE.md': 'Rule.\n', 'src/a.ts': 'a\n' })
    try {
      writeRepoFile(root, 'src/a.ts', 'a2\n')

      const { code, err } = await run(['-C', root, '--dry-run', '--exclude', 'src/**'])

      expect(code).toBe(0)
      expect(err).toContain('no CLAUDE.md or AGENTS.md governs any')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('rule-review interruption', () => {
  test('SIGTERM kills the running agents and exits 130', async () => {
    const { root } = makeRepo({ 'CLAUDE.md': 'Rule.\n', 'src/a.ts': 'a\n' })
    const bin = fakeAgent('echo $$ > "$DIR/pid"\nexec sleep 30')
    const pidFile = join(bin, 'pid')
    const before = new Set(process.listeners('SIGTERM'))
    try {
      writeRepoFile(root, 'src/a.ts', 'a2\n')
      await withPath(bin, async () => {
        const pending = run(['-C', root])

        // The shell creates the file before it writes to it, so wait for a
        // whole line: an empty read would give pid 0, and `kill(0)` signals
        // the test's own process group, which is always alive.
        let pid = 0
        await waitFor('the fake agent to write its pid', () => {
          pid = readPid(pidFile)
          return pid > 0
        })
        const added = process.listeners('SIGTERM').filter((l) => !before.has(l))
        expect(added).toHaveLength(1)
        for (const listener of added) (listener as (s: NodeJS.Signals) => void)('SIGTERM')

        await waitFor(`agent pid ${pid} to exit`, () => !alive(pid))
        expect((await pending).code).toBe(130)
      })
      expect(process.listeners('SIGTERM').filter((l) => !before.has(l))).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(bin, { recursive: true, force: true })
    }
  })
})

describe('rule-review --strict and --engine', () => {
  // One repo with a change under a CLAUDE.md, and a `claude` that fails at once.
  let root: string
  let agent: string
  beforeAll(() => {
    root = makeRepo({ 'CLAUDE.md': 'Rules.\n', 'a.ts': 'a\n' }).root
    writeRepoFile(root, 'a.ts', 'a2\n')
    agent = fakeAgent('echo "no credentials" >&2\nexit 1')
  })
  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(agent, { recursive: true, force: true })
  })
  const failing = (argv: string[]) => withPath(agent, () => run(['-C', root, ...argv]))

  test('an incomplete run exits 0 by default and 11 with --strict', async () => {
    const lenient = await failing(['--blocking'])
    expect(lenient.code).toBe(0)
    expect(lenient.err).toContain('the run was incomplete')

    expect((await failing(['--blocking', '--strict'])).code).toBe(11)
  })

  test('--json prints one review document carrying degraded, and --strict sets the exit code from it', async () => {
    const { code, out } = await failing(['--json', '--strict'])
    const result = JSON.parse(out) as Record<string, unknown>

    expect(Object.keys(result).slice(0, 2)).toEqual(['schemaVersion', 'kind'])
    expect(result).toMatchObject({ schemaVersion: 1, kind: 'review', degraded: true })
    expect(result.changedFiles).toEqual(['a.ts'])
    expect(code).toBe(11)
  })

  test('a dry run that would be incomplete still exits 0 with --strict, with and without --json', async () => {
    // An untracked nested checkout is a changed path git cannot diff, so the
    // root CLAUDE.md's job would not be dispatched: the run is degraded.
    const { root: nested, git } = makeRepo({ 'CLAUDE.md': 'Rules.\n' })
    git.raw(['init', '-q', join(nested, 'sub')])
    writeRepoFile(nested, 'sub/x.ts', 'x\n')
    try {
      const text = await run(['-C', nested, '--dry-run', '--strict', '--blocking'])
      expect(text.code).toBe(0)
      expect(text.err).toContain('not judged: none of its files has a diff')

      const json = await run(['-C', nested, '--dry-run', '--strict', '--blocking', '--json'])
      expect(json.code).toBe(0)
      expect(JSON.parse(json.out)).toMatchObject({ degraded: true, dryRun: true })
    } finally {
      rmSync(nested, { recursive: true, force: true })
    }
  })

  test('a finding is printed with terminal controls removed', async () => {
    const hostile = fakeClaude([
      {
        file: 'a.ts',
        line: 1,
        evidence: 'a2',
        why: 'breaks a rule\u001b[2J\u001b]0;pwned\u0007',
        severity: 'violation',
      },
    ])
    try {
      const { err } = await withPath(hostile, () => run(['-C', root]))
      expect(err).toContain('breaks a rule')
      expect(err).not.toContain('\u001b')
      expect(err).not.toContain('\u0007')
    } finally {
      rmSync(hostile, { recursive: true, force: true })
    }
  })

  test('an unknown --engine is a usage error', async () => {
    const { code, err } = await run(['--engine', 'gpt'])

    expect(code).toBe(2)
    expect(err).toContain('Allowed choices are claude')
  })
})

/** The pid in `file` once a whole line is written, else 0. */
function readPid(file: string): number {
  if (!existsSync(file)) return 0
  const m = /^(\d+)\n/.exec(readFileSync(file, 'utf8'))
  return m === null ? 0 : Number(m[1])
}

describe('rule-review checks', () => {
  const fixtures = join(import.meta.dirname, 'fixtures', 'checks.d')

  /** A throwaway git repository, so `--all` never lists the checkout around the package. */
  let repo: string
  beforeAll(() => {
    repo = makeRepo({ 'README.md': 'r\n' }).root
  })
  afterAll(() => rmSync(repo, { recursive: true, force: true }))

  /** A folder holding the given files, each executable unless named in `plain`. */
  async function folderWith(files: Record<string, string>, plain: string[] = []): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'rule-review-checks-'))
    for (const [name, body] of Object.entries(files)) {
      await writeFile(join(dir, name), body, { mode: plain.includes(name) ? 0o644 : 0o755 })
    }
    return dir
  }

  test('exits 0 when every check passes or is skipped', async () => {
    const dir = await folderWith(
      { '1-ok': '#!/bin/sh\nexit 0\n', '2-doc.md': 'x\n', unprefixed: 'x\n' },
      ['2-doc.md'],
    )

    const { code, out } = await run(['checks', dir, '-C', dir])

    expect(code).toBe(0)
    expect(out).toContain('PASS  1-ok')
    expect(out).toContain('SKIP  2-doc.md - prompt checks not yet supported')
    expect(out).toContain('1 passed, 0 failed, 0 errored, 2 skipped')
  })

  test('exits 1 when a check fails or errors', async () => {
    const failing = await folderWith({ '1-bad': '#!/bin/sh\nexit 2\n' })
    const erroring = await folderWith({ '1-sig': '#!/bin/sh\nkill -TERM $$\n' })

    expect((await run(['checks', failing, '-C', failing])).code).toBe(1)
    expect((await run(['checks', erroring, '-C', erroring])).code).toBe(1)
  })

  test('runs the fixture folder and reports each status', async () => {
    const { code, out } = await run(['checks', fixtures, '--all', '-C', repo])

    expect(code).toBe(1)
    expect(out).toContain('PASS  10-pass')
    expect(out).toContain('FAIL  20-fail - exit 3')
    expect(out).toContain('ERROR 30-slow - timed out after 1s')
    expect(out).toContain('ERROR 50-signal')
    expect(out).toContain('SKIP  90-dir - directory')
  })

  test('--json returns the results as data', async () => {
    const dir = await folderWith({
      '1-ok': '#!/bin/sh\nexit 0\n',
      '2-bad': '#!/bin/sh\nexit 1\n',
    })

    const { code, out } = await run(['checks', dir, '--json', '-C', dir])
    const json = JSON.parse(out)

    expect(code).toBe(1)
    expect(json).toMatchObject({ schemaVersion: 1, kind: 'checks' })
    expect(json.results.map((r: { entry: string; status: string }) => [r.entry, r.status])).toEqual(
      [
        ['1-ok', 'PASS'],
        ['2-bad', 'FAIL'],
      ],
    )
    expect(json.summary).toEqual({ PASS: 1, FAIL: 1, SKIP: 0, ERROR: 0 })
  })

  test('interrupted under --json, it prints the error document instead of partial results', async () => {
    const pidFile = join(tmpdir(), `rule-review-chk-pid-${process.pid}-${Date.now()}`)
    const dir = await folderWith({ '1-slow': `#!/bin/sh\necho $$ > ${pidFile}\nexec sleep 30\n` })
    const before = new Set(process.listeners('SIGTERM'))
    try {
      const pending = run(['checks', dir, '--json', '-C', dir])
      await waitFor('the check to write its pid', () => existsSync(pidFile))
      for (const l of process.listeners('SIGTERM').filter((x) => !before.has(x))) {
        ;(l as (s: NodeJS.Signals) => void)('SIGTERM')
      }
      const { code, out } = await pending

      expect(code).toBe(130)
      expect(JSON.parse(out)).toMatchObject({ kind: 'error', code: 'interrupted', exit: 130 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(pidFile, { force: true })
    }
  })

  test('--dry-run lists the plan and runs nothing', async () => {
    const marker = join(tmpdir(), `rule-review-dry-${process.pid}-${Date.now()}`)
    const dir = await folderWith({ '1-touch': `#!/bin/sh\ntouch ${marker}\n`, '.hid': 'x\n' })

    const { code, out } = await run(['checks', dir, '--dry-run', '-C', dir])

    expect(code).toBe(0)
    expect(out).toContain('RUN   1-touch (timeout 600s)')
    expect(out).toContain("SKIP  .hid - leading '.'")
    expect(out).toContain('Nothing was run.')
    expect(existsSync(marker)).toBe(false)
  })

  test('--dry-run --json gives the plan as data', async () => {
    const { code, out } = await run([
      'checks',
      fixtures,
      '--dry-run',
      '--json',
      '--all',
      '-C',
      repo,
    ])
    const json = JSON.parse(out)

    expect(code).toBe(0)
    expect(json).toMatchObject({ schemaVersion: 1, kind: 'checks-plan' })
    expect(json.run.map((c: { entry: string }) => c.entry)).toContain('30-slow')
    expect(json.skipped).toContainEqual({ entry: '.hidden', reason: "leading '.'" })
  })

  test('a missing folder argument is a usage error', async () => {
    const { code, err } = await run(['checks'])

    expect(code).toBe(2)
    expect(err).toContain("missing required argument 'folder'")
    expect(err).toContain("See 'rule-review checks --help'.")
  })

  test('an unknown flag and an extra argument are usage errors', async () => {
    const flag = await run(['checks', fixtures, '--bogus'])
    const extra = await run(['checks', fixtures, 'other'])

    expect(flag.code).toBe(2)
    expect(flag.err).toContain("unknown option '--bogus'")
    expect(extra.code).toBe(2)
    expect(extra.err).toContain('too many arguments')
  })

  test('a folder that does not exist exits 10', async () => {
    const { code, err } = await run(['checks', join(fixtures, 'nope')])

    expect(code).toBe(10)
    expect(err).toContain('cannot read check folder')
  })

  test('a relative folder resolves against -C', async () => {
    const root = repo
    const { code, out } = await run([
      'checks',
      relative(root, fixtures),
      '--dry-run',
      '--all',
      '-C',
      root,
    ])

    expect(code).toBe(0)
    expect(out).toContain('RUN   10-pass')
  })

  test('--help prints the checks usage; the main usage lists the command', async () => {
    const checks = await run(['checks', '--help'])
    const main = await run(['--help'])

    expect(checks.code).toBe(0)
    expect(checks.out).toContain('Usage: rule-review checks [options] <folder>')
    expect(main.out).toContain('Commands')
    expect(main.out).toContain('checks <folder>')
  })
})

describe('rule-review process spawning', () => {
  test('no source file imports child_process', async () => {
    const root = join(import.meta.dirname, '..')
    const offenders: string[] = []
    for (const dir of ['src', 'tests']) {
      for (const entry of readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })) {
        if (!entry.endsWith('.ts')) continue
        const file = join(dir, entry)
        const text = readFileSync(join(root, file), 'utf8')
        // Line-anchored, so the eval fixtures that quote an import as data do not count.
        if (
          /^\s*(import|export)\b.*['"](node:)?child_process['"]|require\(['"](node:)?child_process/m.test(
            text,
          )
        ) {
          offenders.push(file)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
