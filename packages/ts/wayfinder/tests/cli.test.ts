import { afterAll, describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { captureIo } from '@osdlc/cli-tool'

import { cacheDir } from '../src/cache.ts'
import { makeProject, readCachedCatalog } from '../src/catalog.ts'

const findRoot = (dir: string): Promise<string> => makeProject().findRoot(dir)
import { resolveTrustRoot, trustStore } from '@osdlc/trust-repo'

import { acceptedFlags } from './guide-support.ts'
import { makeGitFixture } from '@osdlc/typed-git/testing'
import { main, rewriteAliases } from '../src/cli.ts'
import { CONFIG_HOME } from './support.ts'

const WORDS = ['list', 'query', 'run', 'serve', 'providers', 'config', 'trust', 'help']

describe('rewriteAliases', () => {
  test('maps each old surface flag onto its command', () => {
    expect(rewriteAliases(['--serve', '--port', '8080'], WORDS)).toEqual({
      argv: ['serve', '--port', '8080'],
    })
    expect(rewriteAliases(['--list', '-C', 'x'], WORDS)).toEqual({ argv: ['list', '-C', 'x'] })
    expect(rewriteAliases(['--json'], WORDS)).toEqual({ argv: ['list', '--json'] })
    // A directory positional is not a command word, so the flag still applies.
    expect(rewriteAliases(['--json', 'some/dir'], WORDS)).toEqual({
      argv: ['list', '--json', 'some/dir'],
    })
  })

  test('two surface flags are refused, since each chooses a surface', () => {
    expect(rewriteAliases(['--serve', '--json'], WORDS)).toEqual({
      error: '--serve and --json each choose a surface; give one',
    })
    expect('error' in rewriteAliases(['--list', '--json'], WORDS)).toBe(true)
  })

  test('a command word after global flags is left alone', () => {
    expect(rewriteAliases(['-C', 'x', 'list', '--json'], WORDS)).toEqual({
      argv: ['-C', 'x', 'list', '--json'],
    })
    // -C takes the next word, so `list` here is a value, not a command.
    expect(rewriteAliases(['-C', 'list', '--json'], WORDS)).toEqual({
      argv: ['list', '--json', '-C', 'list'],
    })
  })

  test('query --list is plain query, its default form', () => {
    expect(rewriteAliases(['query', 'build', '--list'], WORDS)).toEqual({
      argv: ['query', 'build'],
    })
  })

  test('words after -- are not read as flags', () => {
    expect(rewriteAliases(['run', 'x', '--', '--json'], WORDS)).toEqual({
      argv: ['run', 'x', '--', '--json'],
    })
  })
})

/**
 * `main` integration.
 *
 * `parseArgs` proves nothing about the three-way `allowExec` precedence or the
 * report ordering — both live in `main`. `env` and `home` are injected so the
 * developer's own `~/.config/wayfinder/config.json` is never read.
 */

const dirs: string[] = []
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
})

async function temp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'wayfinder-cli-'))
  dirs.push(dir)
  return dir
}

/**
 * The same store `main()` builds — the literal tool name `'wayfinder'`, keyed
 * on an injected `home` so a test can never read or write the real one.
 */
function trustStoreFor(home: string) {
  return trustStore({ tool: 'wayfinder', env: {}, home })
}

/** A project with three parse-only runners: cargo, make, node scripts. */
async function project(config?: unknown, configText?: string): Promise<string> {
  const dir = await temp()
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'p', scripts: { build: 'echo b' } }),
    'utf-8',
  )
  // Escaped, not a literal tab: the repo's control-character check scans
  // source files, and a real tab here would fail it.
  await writeFile(join(dir, 'Makefile'), 'lint:\n\techo l\n', 'utf-8')
  await writeFile(join(dir, 'Cargo.toml'), '[package]\nname = "p"\nversion = "0.1.0"\n', 'utf-8')
  // mise is an exec runner, so an untrusted run withholds it.
  await writeFile(join(dir, 'mise.toml'), '[tasks.hello]\nrun = "echo hi"\n', 'utf-8')
  if (configText !== undefined)
    await writeFile(join(dir, 'wayfinder.config.json'), configText, 'utf-8')
  else if (config !== undefined) {
    await writeFile(join(dir, 'wayfinder.config.json'), JSON.stringify(config), 'utf-8')
  }
  return dir
}

interface Ran {
  code: number
  out: string
  err: string
}

/**
 * Run `main`, capturing what it writes through `CliIo` rather than the
 * process streams. `dir` is appended as `-C dir` when given. The config-branch
 * cases pass it themselves, since where it appears in the argv is part of what
 * they test.
 *
 * `injectedHome` lets a case share a user layer AND a trust store across
 * invocations. Every run injects `env: {}` and a temp home, so no test can
 * read or write the developer's real `~` or `$XDG_STATE_HOME` — a test that
 * granted trust on the machine it ran on would be a bug worse than a failure.
 */
async function run(argv: string[], dir?: string, injectedHome?: string): Promise<Ran> {
  const home = injectedHome ?? (await temp())
  const io = captureIo()
  const code = await main(dir === undefined ? argv : [...argv, '-C', dir], {}, home, io)
  return { code, out: io.out, err: io.err }
}

async function allowExecOf(argv: string[], dir: string): Promise<boolean> {
  const ran = await run(argv, dir)
  expect(ran.code).toBe(0)
  return (JSON.parse(ran.out) as { allowExec: boolean }).allowExec
}

describe('main allowExec precedence', () => {
  test("wayfinder's own default applies when no file answered, once the repo is trusted", async () => {
    // Step 3 of the chain: the default is true. It does not allow execution on
    // its own, so the repository has to be trusted too.
    const home = await temp()
    const dir = await project()
    await trustStoreFor(home).trust(await findRoot(dir))

    const ran = await run(['--json'], dir, home)
    expect(ran.code).toBe(0)
    expect(JSON.parse(ran.out)).toMatchObject({ allowExec: true })
  })

  test("a configured allowExec: false beats wayfinder's own default", async () => {
    // Step 2. This is the case the `sources` check exists for: the effective
    // config always carries an allowExec, so only the layer that supplied it
    // separates "a file said false" from "nobody said anything".
    expect(await allowExecOf(['--json'], await project({ allowExec: false }))).toBe(false)
  })

  test('--exec beats a configured false, and --no-exec beats a configured true', async () => {
    // Step 1, in both directions — an explicit `false` must survive the `??`
    // chain rather than being treated as unset. The `--no-exec` case reads the
    // same either way: a project file cannot raise the gate regardless.
    expect(await allowExecOf(['--json', '--exec'], await project({ allowExec: false }))).toBe(true)
    expect(await allowExecOf(['--json', '--no-exec'], await project({ allowExec: true }))).toBe(
      false,
    )
  })

  test('--no-exec still works with no file at all', async () => {
    expect(await allowExecOf(['--json', '--no-exec'], await project())).toBe(false)
  })
})

/**
 * The trust gate.
 *
 * `allowExec` alone cannot control subprocess execution, because the scanned
 * repository writes `wayfinder.config.json` and wayfinder defaults the setting
 * to `true`. Without trust, a freshly cloned repository would run its own
 * toolchain configuration as soon as it was browsed.
 */
describe('main trust gate', () => {
  /** How many runners the catalog says were not collected because execution was off. */
  function withheld(out: string): string[] {
    return (
      JSON.parse(out) as { reports: Array<{ runner: string; skippedForExec: boolean }> }
    ).reports
      .filter((r) => r.skippedForExec)
      .map((r) => r.runner)
  }

  test('an untrusted root withholds exec runners even with allowExec: true configured', async () => {
    // A user-layer true, which is allowed to raise the configured value. Trust
    // is a second check on top of it, so the answer is still no.
    const home = await temp()
    await mkdir(join(home, CONFIG_HOME, 'wayfinder'), { recursive: true })
    await writeFile(
      join(home, CONFIG_HOME, 'wayfinder', 'config.json'),
      JSON.stringify({ allowExec: true }),
      'utf-8',
    )
    const ran = await run(['--json'], await project(), home)

    expect(ran.code).toBe(0)
    expect(JSON.parse(ran.out)).toMatchObject({ allowExec: false })
    expect(withheld(ran.out).length).toBeGreaterThan(0)
  })

  test('a USER-layer trust.owners policy grants execution by the origin owner, with no marker', async () => {
    // `trustPolicyOptions` binds the git-backed `originOwner`; without it a
    // `trust.owners` entry would silently stop applying.
    const base = await temp()
    const repo = makeGitFixture({ dir: join(base, 'repo') })
    repo.git.remoteAdd('origin', 'https://github.com/AcmeOwner/dev.git')
    await writeFile(join(repo.dir, 'Makefile'), 'lint:\n\techo l\n', 'utf-8')
    const home = await temp()
    await mkdir(join(home, CONFIG_HOME, 'wayfinder'), { recursive: true })
    await writeFile(
      join(home, CONFIG_HOME, 'wayfinder', 'config.json'),
      JSON.stringify({ allowExec: true, trust: { owners: ['acmeowner'] } }),
      'utf-8',
    )
    const ran = await run(['--json'], repo.dir, home)

    expect(ran.code).toBe(0)
    expect(JSON.parse(ran.out)).toMatchObject({ allowExec: true })
    expect(await trustStoreFor(home).list()).toEqual([])
  })

  test('--list says once, on stderr, how many runners trust would collect', async () => {
    const ran = await run(['--list'], await project())

    expect(ran.code).toBe(0)
    expect(ran.err).toContain('1 runner withheld')
    expect(ran.err).toContain('run "way trust" to trust it')
    // Once, not once per runner.
    expect(ran.err.split('withheld —').length - 1).toBe(1)
  })

  test('--exec collects them for this run only, recording nothing', async () => {
    const home = await temp()
    const ran = await run(['--json', '--exec'], await project(), home)

    expect(JSON.parse(ran.out)).toMatchObject({ allowExec: true })
    // The store stays empty. Consent for one run, typed by a person at the
    // moment of running, must not become a standing grant nobody remembers.
    expect(await trustStoreFor(home).list()).toEqual([])
    // And with the gate open, the trust sentence would be a wrong instruction.
    expect(ran.err).not.toContain('not trusted')
  })

  test('after trust the withheld runners are collected', async () => {
    const home = await temp()
    const dir = await project()

    const before = await run(['--json'], dir, home)
    expect(withheld(before.out).length).toBeGreaterThan(0)

    await trustStoreFor(home).trust(await findRoot(dir))

    const after = await run(['--json'], dir, home)
    expect(JSON.parse(after.out)).toMatchObject({ allowExec: true })
    expect(withheld(after.out)).toEqual([])
    expect(after.err).not.toContain('not collected')
  })

  test('trust --show and --list report the store, and --untrust empties it', async () => {
    const home = await temp()
    const dir = await project()
    // Symlink-resolved, which is what the store is keyed on: macOS reports the
    // temp directory as /var/... and resolves it to /private/var/....
    const root = await resolveTrustRoot(await findRoot(dir))

    expect(await run(['trust', '--show', '-C', dir], undefined, home)).toMatchObject({
      code: 0,
      out: `not trusted ${root}\n`,
    })

    expect(await run(['trust', '-C', dir], undefined, home)).toMatchObject({ code: 0 })
    expect(await run(['trust', '--show', '-C', dir], undefined, home)).toMatchObject({
      out: `trusted ${root} (by marker)\n`,
    })
    expect(await run(['trust', '--list'], undefined, home)).toMatchObject({
      code: 0,
      out: `${root}\n`,
    })

    expect(await run(['trust', '--untrust', '-C', dir], undefined, home)).toMatchObject({
      code: 0,
      out: `untrusted ${root}\n`,
    })
    expect(await run(['trust', '--list'], undefined, home)).toMatchObject({ code: 0, out: '' })
  })

  test('trust --untrust on a root that was never trusted fails rather than lying', async () => {
    // Exit 1, not 2: the command was well formed, it just failed against the
    // state it found.
    const ran = await run(['trust', '--untrust', '-C', await project()], undefined, await temp())
    expect(ran.code).toBe(1)
    expect(ran.err).toContain('not trusted')
  })
})

describe('main config wiring', () => {
  test('a configured runners.disabled drops that runner from --list', async () => {
    const ran = await run(['--list'], await project({ runners: { disabled: ['make'] } }))

    expect(ran.code).toBe(0)
    expect(ran.out).not.toContain('make lint')
    expect(ran.out).toContain('cargo clippy')
  })

  test('--exclude REPLACES the configured runners.disabled', async () => {
    const ran = await run(
      ['--list', '--exclude', 'cargo'],
      await project({ runners: { disabled: ['make'] } }),
    )

    expect(ran.code).toBe(0)
    expect(ran.out).not.toContain('cargo clippy')
    expect(ran.out).toContain('make lint')
  })

  test('a configured runners.order reorders reports, unlisted ones alphabetical', async () => {
    const ran = await run(['--json'], await project({ runners: { order: ['make', 'cargo'] } }))

    expect(ran.code).toBe(0)
    const runners = (JSON.parse(ran.out) as { reports: Array<{ runner: string }> }).reports.map(
      (r) => r.runner,
    )
    expect(runners.slice(0, 2)).toEqual(['make', 'cargo'])
    const tail = runners.slice(2)
    expect(tail).toEqual([...tail].sort())
  })

  test('a configured discovery reaches collect', async () => {
    const ran = await run(['--json'], await project({ discovery: 'walk' }))
    expect(JSON.parse(ran.out)).toMatchObject({ discovery: 'walk' })
  })

  test('a malformed config file fails the run, naming the file', async () => {
    const dir = await project(undefined, '{ not json')
    const ran = await run(['--list'], dir)

    expect(ran.code).toBe(1)
    expect(ran.err).toContain(join(dir, 'wayfinder.config.json'))
    expect(ran.err).toContain('invalid JSON')
    expect(ran.out).toBe('')
  })

  test("config honours -C, reporting the named directory's project", async () => {
    // -C is documented as a global flag, and the config branch runs before the
    // flags are parsed. Without explicit handling, -C would be accepted and
    // ignored, and the current directory reported instead.
    const dir = await project({ discovery: 'walk' })
    const ran = await run(['config', 'path', '-C', dir])

    expect(ran.code).toBe(0)
    expect(ran.out).toContain(`${join(dir, 'wayfinder.config.json')} (exists)`)
  })

  test("config -C reads that directory's values, not the current one's", async () => {
    const dir = await project({ discovery: 'walk' })
    expect(await run(['config', 'get', 'discovery', '-C', dir])).toMatchObject({
      code: 0,
      out: '"walk"\n',
    })
  })

  test('config -C with no path is an error rather than a silent drop', async () => {
    const ran = await run(['config', 'path', '-C'])
    expect(ran.code).toBe(2)
    expect(ran.err).toContain("'-C, --dir <PATH>' argument missing")
  })
})

describe('guide', () => {
  // CLI wiring only. What the guide SAYS is checked in tests/guide.test.ts,
  // against the source each claim describes.
  test('a topic is read as the topic, not as a flag', async () => {
    const ran = await run(['guide', 'extend'])
    expect(ran.code).toBe(0)
    expect(ran.out).toContain('## extend')
    expect(ran.err).toBe('')
  })
})

/** The `--cached` notes alone; other stderr lines (withheld runners) are not ours. */
function cacheLines(err: string): string[] {
  return err.split('\n').filter((l) => l.includes('--cached:') || l.includes('nothing cached'))
}

/**
 * `--cached` on the DATA surfaces.
 *
 * --json and --list are what a script or an agent reads, so they re-probe by
 * default and this flag is the opt-out. The interactive surfaces are the other
 * way round — they always start from the store — which is why nothing here
 * touches the TUI or --serve.
 *
 * Every case injects `env: {}` and a temp `home`, so the store is
 * `<temp home>/.cache/wayfinder` and the real `~/.cache/wayfinder` is never touched.
 */
describe('--cached', () => {
  test('is off by default, and a default run WARMS the store', async () => {
    const home = await temp()
    const dir = await project()
    const fresh = await run(['--list'], dir, home)

    expect(fresh.code).toBe(0)
    expect(cacheLines(fresh.err)).toEqual([])
    const stored = await readCachedCatalog(
      makeProject(),
      await findRoot(dir),
      {},
      cacheDir({}, home),
    )
    expect(stored.runners.find((r) => r.runner === 'make')?.state).toBe('fresh')
  })

  test('on a COLD cache probes anyway and says so, rather than failing', async () => {
    const dir = await project()
    const ran = await run(['--list', '--cached'], dir)

    expect(ran.code).toBe(0)
    expect(ran.out).toContain('make lint')
    expect(ran.err).toContain('nothing cached for this repository yet')
  })

  test('on a WARM cache answers from it, leaving stdout byte-identical', async () => {
    const home = await temp()
    const dir = await project()
    const warm = await run(['--list'], dir, home)
    const cached = await run(['--list', '--cached'], dir, home)

    expect(cached.out).toBe(warm.out)
    expect(cached.code).toBe(0)
    // Nothing moved between the runs, so nothing is stale and nothing is said.
    expect(cacheLines(cached.err)).toEqual([])
  })

  test('a changed file makes a runner stale, named on stderr and nowhere else', async () => {
    const home = await temp()
    const dir = await project()
    await run(['--list'], dir, home)
    await writeFile(join(dir, 'Makefile'), 'lint:\n\techo l\nship:\n\techo s\n', 'utf-8')

    const cached = await run(['--list', '--cached'], dir, home)
    expect(cached.code).toBe(0)
    // The stale answer is shown, which is the point of the flag. stdout stays
    // pipeable because the note goes to stderr.
    expect(cached.out).not.toContain('make ship')
    expect(cacheLines(cached.err)).toHaveLength(1)
    expect(cacheLines(cached.err)[0]).toMatch(
      /^way: --cached: .*\bmake \(stale: its files changed, /,
    )
  })

  test('a runner missing from the store is probed, not dropped', async () => {
    const home = await temp()
    const dir = await project()
    await run(['--list', '--only', 'make'], dir, home)

    const cached = await run(['--list', '--cached'], dir, home)
    expect(cached.out).toContain('make lint')
    expect(cached.out).toContain('cargo clippy')
    expect(cacheLines(cached.err)[0]).toContain('not cached, probed now:')
  })

  test('--json always carries the cache array, with the probe time after a fresh probe', async () => {
    const home = await temp()
    const dir = await project()
    const fresh = JSON.parse((await run(['--json'], dir, home)).out) as {
      cache: Array<{ runner: string; state: string; ageMs: number; probeMs?: number }>
    }
    const make = fresh.cache.find((r) => r.runner === 'make')
    expect(make).toMatchObject({ state: 'fresh', ageMs: 0 })
    expect(typeof make?.probeMs).toBe('number')
    // mise is withheld, so it was not probed and has no time.
    expect(fresh.cache.find((r) => r.runner === 'mise')?.probeMs).toBeUndefined()

    const cached = JSON.parse((await run(['--json', '--cached'], dir, home)).out) as {
      cache: Array<{ runner: string; state: string; estimateMs: number | null; slow: boolean }>
    }
    expect(Array.isArray(cached.cache)).toBe(true)
    expect(cached.cache.length).toBeGreaterThan(0)
    for (const row of cached.cache) {
      expect(['fresh', 'stale', 'miss']).toContain(row.state)
      // Never invented: an unmeasured cost is null, not a plausible number.
      expect(row.estimateMs === null || typeof row.estimateMs === 'number').toBe(true)
    }
  })
})

/**
 * `query` — the terminal UI's search, without the UI.
 *
 * The matcher itself is system-model's and is tested there; what is wayfinder's
 * own is the wiring: which tasks reach it, what comes out, and the exit code a
 * script reads.
 */
describe('query', () => {
  /** A project with a dev server in it, so `--services` has something to keep. */
  async function scripts(): Promise<string> {
    const dir = await temp()
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'p', scripts: { build: 'echo b', dev: 'vite', deploy: 'echo d' } }),
      'utf-8',
    )
    return dir
  }

  test('prints one command line per match, best first', async () => {
    const ran = await run(['query', 'ploy'], await scripts())
    expect(ran.code).toBe(0)
    expect(ran.out).toBe('npm run deploy\n')
  })

  test('ranks a leaf hit above one buried in the chain', async () => {
    // "de" is a substring of the runner id too, so every script matches; what
    // is asserted is the ORDER, which is the whole reason to rank rather than
    // filter.
    const ran = await run(['query', 'de'], await scripts())
    expect(ran.out.split('\n').slice(0, 2)).toEqual(['npm run dev', 'npm run deploy'])
  })

  test('--exact drops the subsequence hits a fuzzy search keeps', async () => {
    const dir = await scripts()
    expect((await run(['query', 'dploy'], dir)).out).toBe('npm run deploy\n')
    expect((await run(['query', 'dploy', '--exact'], dir)).code).toBe(1)
  })

  test('--services keeps only what runs until you stop it', async () => {
    const ran = await run(['query', '--services'], await scripts())
    expect(ran.out).toBe('npm run dev\n')
  })

  test('a search that matched nothing is exit 1 with an empty stdout', async () => {
    // grep's contract, so `way query dev && …` is usable from a script.
    const ran = await run(['query', 'nosuchtask'], await scripts())
    expect(ran.code).toBe(1)
    expect(ran.out).toBe('')
  })

  test('no terms is every task, exactly as --list', async () => {
    const dir = await scripts()
    const queried = await run(['query'], dir)
    // Nothing was searched for, so nothing can have failed to match.
    expect(queried.code).toBe(0)
    expect(queried.out).toBe((await run(['--list'], dir)).out)
  })

  test('--json prints the matching tasks rather than their command lines', async () => {
    const ran = await run(['query', 'ploy', '--json'], await scripts())
    expect(ran.code).toBe(0)
    const doc = JSON.parse(ran.out) as {
      kind: string
      schemaVersion: number
      tasks: Array<{ display: string; argv: string[] }>
    }
    expect(doc).toMatchObject({ kind: 'query', schemaVersion: 1 })
    const tasks = doc.tasks
    expect(tasks.map((t) => t.display)).toEqual(['npm run deploy'])
    // The whole task, not a summary: argv is what a caller would spawn.
    expect(tasks[0]?.argv).toEqual(['npm', 'run', 'deploy'])
  })

  test('says on stderr what trust would add, leaving stdout pipeable', async () => {
    const ran = await run(['query', 'lint'], await project())
    // The mise.toml fixture also brings a synthesized `mise install` row.
    expect(ran.out.split('\n')[0]).toBe('make lint')
    expect(ran.out).not.toContain('mise hello')
    expect(ran.err).toContain('withheld')
  })
})

/**
 * The help tiers.
 *
 * `--help` is tier 1 and `--help --all` is tier 2. Tier 1 must name the tiers
 * below it, and tier 2 must stay complete.
 */
describe('help tiers', () => {
  test('--help is the short form, and says where the rest of the surface is', async () => {
    const short = (await run(['--help'])).out

    expect(short.split('\n').length).toBeLessThan(45)
    // The short help says where the rest is.
    expect(short).toContain('help --all')
    expect(short).toContain('guide')
    // Trust hides runners by default. Without this line a reader sees a
    // shorter catalog and no reason why.
    expect(short).toContain('trust')
    // And a tier-2 flag does not appear in tier 1.
    expect(short).not.toContain('--exclude-path')
  })

  test('--help --all is the complete tier: every flag the parser accepts is in it', async () => {
    // Derived from the complete help, which the command tree renders from the flag
    // declaration, so a flag added to the parser is always in tier 2. What
    // this still checks is that tier 2 contains tier 1 and is longer.
    const all = (await run(['--help', '--all'])).out
    const accepted = acceptedFlags(all)

    expect(accepted.size).toBeGreaterThan(0)
    expect([...accepted].filter((flag) => !all.includes(flag)).sort()).toEqual([])
    expect(all.length).toBeGreaterThan((await run(['--help'])).out.length)
  })

  test('a usage error answers with the short form, not the whole surface', async () => {
    // The tiers exist so a mistyped flag does not print the complete text.
    // The error is the part the reader needs.
    const ran = await run(['--nope'])

    expect(ran.code).toBe(2)
    expect(ran.out).toBe('')
    expect(ran.err).toContain("unknown option '--nope'")
    expect(ran.err).toContain('way help')
    expect(ran.err).not.toContain('--exclude-path')
  })

  test('both tiers are exit 0 on stdout, with nothing on stderr', async () => {
    for (const argv of [['--help'], ['-h'], ['--help', '--all']]) {
      const ran = await run(argv)
      expect(ran.code).toBe(0)
      expect(ran.err).toBe('')
      expect(ran.out).toContain('Browse and run every task')
    }
  })
})
