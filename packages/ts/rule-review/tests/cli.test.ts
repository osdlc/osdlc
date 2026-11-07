import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { chmodSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { captureOutput } from './capture-output.ts'
import { makeRepo, writeFile as writeRepoFile } from './fixture-repo.ts'
import { SUBPROCESS_TIMEOUT_MS } from './subprocess-timeout.ts'
import { main } from '../src/cli.ts'

/** Run the CLI with stdout/stderr captured. */
function run(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  return captureOutput(() => main(argv))
}

describe('rule-review argument handling', () => {
  test('--help prints usage to stdout and exits 0', async () => {
    const { code, out } = await run(['--help'])

    expect(code).toBe(0)
    expect(out).toContain('rule-review — review a changeset')
    expect(out).toContain('--dry-run')
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
    expect(err).toContain('violation, tension, or drift')
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

  test(
    'a -C directory that does not exist is a usage error (2), for dfv and rule-review checks',
    async () => {
      const missing = join(tmpdir(), `rule-review-missing-${process.pid}-${Date.now()}`)

      const verify = await run(['-C', missing, '--dry-run'])
      expect(verify.code).toBe(2)
      expect(verify.err).toContain(`rule-review: ${missing}`)

      const checks = await run(['checks', 'chk', '-C', missing])
      expect(checks.code).toBe(2)
      expect(checks.err).toContain(`rule-review: ${missing}`)
    },
    SUBPROCESS_TIMEOUT_MS,
  )

  test('a directory outside a git repo fails cleanly', async () => {
    const { code, err } = await run(['-C', '/'])

    expect(code).toBe(2)
    expect(err).toContain('not inside a git repository')
  })
})

describe('rule-review scope patterns', () => {
  test(
    'an --exclude pattern the matcher rejects exits 2 with the reason on stderr',
    async () => {
      const { root } = makeRepo({ 'CLAUDE.md': 'Rule.\n', 'src/a.ts': 'a\n' })
      try {
        writeRepoFile(root, 'src/a.ts', 'a2\n')

        const { code, err } = await run(['-C', root, '--dry-run', '--exclude', '!(b).ts'])

        expect(code).toBe(2)
        expect(err).toContain('rule-review: exclude:')
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
    SUBPROCESS_TIMEOUT_MS,
  )

  test(
    'a plain --exclude drops the matching file from the plan',
    async () => {
      const { root } = makeRepo({ 'CLAUDE.md': 'Rule.\n', 'src/a.ts': 'a\n' })
      try {
        writeRepoFile(root, 'src/a.ts', 'a2\n')

        const { code, err } = await run(['-C', root, '--dry-run', '--exclude', 'src/**'])

        expect(code).toBe(0)
        expect(err).toContain('no CLAUDE.md or AGENTS.md governs any')
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
    SUBPROCESS_TIMEOUT_MS,
  )
})

describe('rule-review interruption', () => {
  test(
    'SIGTERM kills the running agents and exits 130',
    async () => {
      const { root } = makeRepo({ 'CLAUDE.md': 'Rule.\n', 'src/a.ts': 'a\n' })
      const bin = await mkdtemp(join(tmpdir(), 'rule-review-fake-agent-'))
      const pidFile = join(bin, 'pid')
      writeFileSync(join(bin, 'claude'), `#!/bin/sh\necho $$ > "${pidFile}"\nexec sleep 30\n`)
      chmodSync(join(bin, 'claude'), 0o755)
      const path = process.env['PATH']
      process.env['PATH'] = `${bin}:${path ?? ''}`
      const before = new Set(process.listeners('SIGTERM'))
      try {
        writeRepoFile(root, 'src/a.ts', 'a2\n')
        const pending = run(['-C', root])

        await waitFor('the fake agent to write its pid', () => existsSync(pidFile))
        const pid = Number(readFileSync(pidFile, 'utf8').trim())
        const added = process.listeners('SIGTERM').filter((l) => !before.has(l))
        expect(added).toHaveLength(1)
        for (const listener of added) (listener as (s: NodeJS.Signals) => void)('SIGTERM')

        await waitFor(`agent pid ${pid} to exit`, () => !alive(pid))
        expect((await pending).code).toBe(130)
        expect(process.listeners('SIGTERM').filter((l) => !before.has(l))).toEqual([])
      } finally {
        process.env['PATH'] = path
        rmSync(root, { recursive: true, force: true })
        rmSync(bin, { recursive: true, force: true })
      }
    },
    SUBPROCESS_TIMEOUT_MS,
  )
})

/** Poll `check` until true; throw naming `what` if it never is. */
async function waitFor(what: string, check: () => boolean, ceilingMs = 10_000): Promise<void> {
  const deadline = Date.now() + ceilingMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 20))
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
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

  test(
    'exits 0 when every check passes or is skipped',
    async () => {
      const dir = await folderWith(
        { '1-ok': '#!/bin/sh\nexit 0\n', '2-doc.md': 'x\n', unprefixed: 'x\n' },
        ['2-doc.md'],
      )

      const { code, out } = await run(['checks', dir, '-C', dir])

      expect(code).toBe(0)
      expect(out).toContain('PASS  1-ok')
      expect(out).toContain('SKIP  2-doc.md - prompt checks not yet supported')
      expect(out).toContain('1 passed, 0 failed, 0 errored, 2 skipped')
    },
    SUBPROCESS_TIMEOUT_MS,
  )

  test(
    'exits 1 when a check fails or errors',
    async () => {
      const failing = await folderWith({ '1-bad': '#!/bin/sh\nexit 2\n' })
      const erroring = await folderWith({ '1-sig': '#!/bin/sh\nkill -TERM $$\n' })

      expect((await run(['checks', failing, '-C', failing])).code).toBe(1)
      expect((await run(['checks', erroring, '-C', erroring])).code).toBe(1)
    },
    SUBPROCESS_TIMEOUT_MS,
  )

  test(
    'runs the fixture folder and reports each status',
    async () => {
      const { code, out } = await run(['checks', fixtures, '--all', '-C', repo])

      expect(code).toBe(1)
      expect(out).toContain('PASS  10-pass')
      expect(out).toContain('FAIL  20-fail - exit 3')
      expect(out).toContain('ERROR 30-slow - timed out after 1s')
      expect(out).toContain('ERROR 50-signal')
      expect(out).toContain('SKIP  90-dir - directory')
    },
    SUBPROCESS_TIMEOUT_MS,
  )

  test(
    '--json returns the results as data',
    async () => {
      const dir = await folderWith({
        '1-ok': '#!/bin/sh\nexit 0\n',
        '2-bad': '#!/bin/sh\nexit 1\n',
      })

      const { code, out } = await run(['checks', dir, '--json', '-C', dir])
      const json = JSON.parse(out)

      expect(code).toBe(1)
      expect(
        json.results.map((r: { entry: string; status: string }) => [r.entry, r.status]),
      ).toEqual([
        ['1-ok', 'PASS'],
        ['2-bad', 'FAIL'],
      ])
      expect(json.summary).toEqual({ PASS: 1, FAIL: 1, SKIP: 0, ERROR: 0 })
    },
    SUBPROCESS_TIMEOUT_MS,
  )

  test(
    '--dry-run lists the plan and runs nothing',
    async () => {
      const marker = join(tmpdir(), `rule-review-dry-${process.pid}-${Date.now()}`)
      const dir = await folderWith({ '1-touch': `#!/bin/sh\ntouch ${marker}\n`, '.hid': 'x\n' })

      const { code, out } = await run(['checks', dir, '--dry-run', '-C', dir])

      expect(code).toBe(0)
      expect(out).toContain('RUN   1-touch (timeout 600s)')
      expect(out).toContain("SKIP  .hid - leading '.'")
      expect(out).toContain('Nothing was run.')
      expect(existsSync(marker)).toBe(false)
    },
    SUBPROCESS_TIMEOUT_MS,
  )

  test(
    '--dry-run --json gives the plan as data',
    async () => {
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
      expect(json.dryRun).toBe(true)
      expect(json.run.map((c: { entry: string }) => c.entry)).toContain('30-slow')
      expect(json.skipped).toContainEqual({ entry: '.hidden', reason: "leading '.'" })
    },
    SUBPROCESS_TIMEOUT_MS,
  )

  test(
    'a missing folder argument is a usage error',
    async () => {
      const { code, err } = await run(['checks'])

      expect(code).toBe(2)
      expect(err).toContain('needs a folder')
    },
    SUBPROCESS_TIMEOUT_MS,
  )

  test(
    'an unknown flag and an extra argument are usage errors',
    async () => {
      const flag = await run(['checks', fixtures, '--bogus'])
      const extra = await run(['checks', fixtures, 'other'])

      expect(flag.code).toBe(2)
      expect(flag.err).toContain("unknown option '--bogus'")
      expect(extra.code).toBe(2)
      expect(extra.err).toContain("unexpected argument 'other'")
    },
    SUBPROCESS_TIMEOUT_MS,
  )

  test(
    'a folder that does not exist is a usage error',
    async () => {
      const { code, err } = await run(['checks', join(fixtures, 'nope')])

      expect(code).toBe(2)
      expect(err).toContain('cannot read check folder')
    },
    SUBPROCESS_TIMEOUT_MS,
  )

  test(
    'a relative folder resolves against -C',
    async () => {
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
    },
    SUBPROCESS_TIMEOUT_MS,
  )

  test(
    '--help prints the checks usage; the main usage lists the command',
    async () => {
      const checks = await run(['checks', '--help'])
      const main = await run(['--help'])

      expect(checks.code).toBe(0)
      expect(checks.out).toContain('rule-review checks <dir>')
      expect(main.out).toContain('Commands')
      expect(main.out).toContain('checks <dir>')
    },
    SUBPROCESS_TIMEOUT_MS,
  )
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
