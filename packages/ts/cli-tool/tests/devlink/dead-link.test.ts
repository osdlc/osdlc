/**
 * `onDeadLink: 'newest-surviving'`: when the link names a checkout that is
 * gone, `resolve()` and the bash launcher both run the first surviving line of
 * the `candidates` file, which `link` and `use` write. Each case is driven
 * through both, so the two stay in step.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { renderLauncher } from '../../src/devlink/launcher.ts'
import { history, link, off, use } from '../../src/devlink/ops.ts'
import { resolve, type ResolveOptions } from '../../src/devlink/resolve.ts'
import { validateSpec, type ToolSpec } from '../../src/devlink/spec.ts'
import {
  appendHistory,
  candidatesPath,
  readCandidates,
  writeActive,
  writeCandidates,
} from '../../src/devlink/state.ts'
import { SPEC, sandbox, seedCheckout, type Sandbox } from './support.ts'

const NEWEST: ToolSpec = { ...SPEC, onDeadLink: 'newest-surviving' }

/** What the fake bun prints for a run: the flags that keep Bun off the cwd's config. */
const BUN_RUN = 'BUN --no-env-file --config=/dev/null run'

let sb: Sandbox
let fakeBin: string
beforeEach(() => {
  sb = sandbox()
  fakeBin = join(sb.root, 'fakebin')
  mkdirSync(fakeBin, { recursive: true })
  writeFileSync(join(fakeBin, 'bun'), '#!/bin/sh\necho "BUN $*"\n')
  chmodSync(join(fakeBin, 'bun'), 0o755)
})
afterEach(() => sb.dispose())

const state = () => ({ dirs: sb.dirs })
const opts = (extra: Partial<ResolveOptions> = {}): ResolveOptions => ({
  dirs: sb.dirs,
  env: {},
  cwd: sb.root,
  ...extra,
})

/** A checkout whose launcher is the real render of `spec`. */
function launcherCheckoutFor(dir: string, spec: ToolSpec): string {
  seedCheckout(dir, spec)
  writeFileSync(join(dir, spec.launcher), renderLauncher(spec))
  chmodSync(join(dir, spec.launcher), 0o755)
  return dir
}

/**
 * Runs the launcher with the sandbox home (where `sb.dirs` puts the state).
 * Prints the entry the fake bun was asked to run.
 */
function run(launcher: string, cwd: string, env: Record<string, string> = {}) {
  const r = spawnSync('bash', [launcher], {
    cwd,
    encoding: 'utf-8',
    env: { HOME: sb.home, PATH: `${fakeBin}:/usr/bin:/bin`, TOOLY_QUIET: '1', ...env },
  })
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() }
}

/** The checkout the bash launcher at `self` runs, or `self` itself for local. */
function bashPick(self: string, cwd = sb.root, env: Record<string, string> = {}): string {
  const r = run(join(self, NEWEST.launcher), cwd, env)
  expect(r.err).toBe('')
  expect(r.out.startsWith(`${BUN_RUN} `)).toBe(true)
  return r.out.slice(`${BUN_RUN} `.length).replace(/\/src\/cli\.ts$/, '')
}

/** The checkout `resolve()` runs for a launcher in `self`, or `self` for local. */
function tsPick(self: string, extra: Partial<ResolveOptions> = {}): string {
  const sel = resolve(NEWEST, opts({ self, ...extra }))
  return sel.source === 'local' ? self : sel.checkout
}

/** Writes the state as `dev link` would leave it: `linked` in `home`, `list` in `candidates`. */
function seedState(linked: string | null, list: string | null, spec: ToolSpec = NEWEST): void {
  if (linked !== null) writeActive(spec, linked, state())
  if (list !== null) {
    mkdirSync(sb.stateDir, { recursive: true })
    writeFileSync(candidatesPath(spec, state()), list)
  }
}

describe('validateSpec', () => {
  test.each(['local', 'newest-surviving'] as const)('accepts onDeadLink %j', (onDeadLink) => {
    const spec = { ...SPEC, onDeadLink }
    expect(validateSpec(spec)).toBe(spec)
  })

  test('refuses any other onDeadLink', () => {
    const spec = { ...SPEC, onDeadLink: 'newest' } as unknown as ToolSpec
    expect(() => validateSpec(spec)).toThrow(/onDeadLink must be 'local' or 'newest-surviving'/)
  })
})

describe('resolve()', () => {
  test('without onDeadLink, or with local, a dead link runs the install', () => {
    const b = seedCheckout(join(sb.root, 'b'))
    seedState(join(sb.root, 'gone'), `${b}\n`)
    const { onDeadLink: _unset, ...plain } = NEWEST
    expect(resolve(plain, opts()).source).toBe('local')
    expect(resolve({ ...SPEC, onDeadLink: 'local' }, opts()).source).toBe('local')
  })

  test('a dead link runs the newest surviving candidate, as the link layer', () => {
    const b = seedCheckout(join(sb.root, 'b'))
    const c = seedCheckout(join(sb.root, 'c'))
    const gone = join(sb.root, 'gone')
    seedState(gone, `${gone}\n${join(sb.root, 'also-gone')}\n${b}\n${c}\n`)
    const sel = resolve(NEWEST, opts())
    expect(sel.source).toBe('link')
    expect(sel.checkout).toBe(b)
    expect(sel.entry).toBe(join(b, 'src', 'cli.ts'))
    expect(sel.reason).toBe(`newest surviving checkout (the link names ${gone}, which is gone)`)
  })

  test('a live link wins over the list', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    seedState(a, `${b}\n`)
    const sel = resolve(NEWEST, opts())
    expect(sel.checkout).toBe(a)
    expect(sel.reason).toBe('linked checkout')
  })

  test('no link (dev off) runs the install, whatever the list holds', () => {
    const b = seedCheckout(join(sb.root, 'b'))
    seedState(null, `${b}\n`)
    expect(resolve(NEWEST, opts()).source).toBe('local')
  })

  test('with no candidate left, the layer is skipped as before', () => {
    seedState(join(sb.root, 'gone'), `${join(sb.root, 'gone')}\n`)
    expect(resolve(NEWEST, opts()).source).toBe('local')
  })

  test('a missing list, or one that cannot be read, reads as empty', () => {
    seedState(join(sb.root, 'gone'), null)
    expect(resolve(NEWEST, opts()).source).toBe('local')
    mkdirSync(candidatesPath(NEWEST, state())) // EISDIR
    expect(readCandidates(NEWEST, state())).toEqual([])
    expect(resolve(NEWEST, opts()).source).toBe('local')
  })

  test('a suppressor turns the fall-back off with the rest of the layer', () => {
    const b = seedCheckout(join(sb.root, 'b'))
    seedState(join(sb.root, 'gone'), `${b}\n`)
    expect(resolve(NEWEST, opts({ env: { TOOLY_HARNESS: '1' } })).source).toBe('local')
  })

  test('a surviving candidate that is this checkout is the local no-op', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    seedState(join(sb.root, 'gone'), `${a}\n`)
    const sel = resolve(NEWEST, opts({ self: a }))
    expect(sel.source).toBe('local')
    expect(sel.reason).toMatch(/^newest surviving checkout .*: this checkout$/)
  })

  test('the env and cwd layers still come first', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    const c = seedCheckout(join(sb.root, 'c'))
    seedState(join(sb.root, 'gone'), `${c}\n`)
    expect(resolve(NEWEST, opts({ env: { TOOLY_HOME: a } })).checkout).toBe(a)
    expect(resolve(NEWEST, opts({ cwd: join(b, 'src') })).checkout).toBe(b)
  })
})

describe('link and use keep the list', () => {
  const at = (n: number) => () => new Date(Date.UTC(2026, 10, 5, 0, 0, n))

  test('newest first, one line per checkout, and off leaves it', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    link(NEWEST, { checkout: a }, { ...opts(), now: at(1) })
    expect(readFileSync(candidatesPath(NEWEST, state()), 'utf-8')).toBe(`${a}\n`)
    use(NEWEST, { target: b }, { ...opts(), now: at(2) })
    expect(readCandidates(NEWEST, state())).toEqual([b, a])
    use(NEWEST, { target: '#2' }, { ...opts(), now: at(3) })
    expect(readCandidates(NEWEST, state())).toEqual([a, b])
    off(NEWEST, opts())
    expect(readCandidates(NEWEST, state())).toEqual([a, b])
  })

  test('the list follows history, so links made before opting in count', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    link(SPEC, { checkout: a }, opts())
    expect(existsSync(candidatesPath(SPEC, state()))).toBe(false)
    link(NEWEST, { checkout: b }, opts())
    expect(readCandidates(NEWEST, state())).toEqual([b, a])
  })

  test('a checkout that is gone stays listed, since a worktree may come back at that path', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    link(NEWEST, { checkout: a }, opts())
    rmSync(a, { recursive: true })
    link(NEWEST, { checkout: b }, opts())
    expect(readCandidates(NEWEST, state())).toEqual([b, a])
  })

  test('a dry run writes no list', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    link(NEWEST, { checkout: a }, { ...opts(), dryRun: true })
    expect(existsSync(candidatesPath(NEWEST, state()))).toBe(false)
  })

  test('keeps the 32 newest checkouts; the history keeps the rest', () => {
    const dirs: string[] = []
    for (let i = 0; i < 40; i++) {
      const dir = seedCheckout(join(sb.root, `w${i}`))
      dirs.push(dir)
      link(NEWEST, { checkout: dir }, { ...opts(), now: at(i) })
    }
    expect(readCandidates(NEWEST, state())).toEqual(dirs.slice(8).reverse())
    expect(history(NEWEST, opts())).toHaveLength(40)
  })

  test('a history path with a line break is left out of the list', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const odd = join(sb.root, 'x\ny')
    appendHistory(NEWEST, { at: '2026-11-05T00:00:00Z', event: 'link', checkout: odd }, state())
    link(NEWEST, { checkout: a }, opts())
    expect(readCandidates(NEWEST, state())).toEqual([a])
  })
})

describe('writeCandidates and readCandidates', () => {
  test('round-trip, with lines kept as written', () => {
    writeCandidates(NEWEST, ['/one', '/two '], state())
    expect(readFileSync(candidatesPath(NEWEST, state()), 'utf-8')).toBe('/one\n/two \n')
    expect(readCandidates(NEWEST, state())).toEqual(['/one', '/two '])
    writeCandidates(NEWEST, [], state())
    expect(readCandidates(NEWEST, state())).toEqual([])
  })

  test('refuses a path with a line break', () => {
    expect(() => writeCandidates(NEWEST, ['/a\nb'], state())).toThrow(/line break/)
    expect(() => writeCandidates(NEWEST, ['/a\rb'], state())).toThrow(/line break/)
  })
})

describe('the bash launcher agrees with resolve()', () => {
  test('a launcher rendered without onDeadLink, or with local, does not read the list', () => {
    const { onDeadLink: _unset, ...plain } = NEWEST
    expect(renderLauncher({ ...SPEC, onDeadLink: 'local' })).toBe(renderLauncher(plain))
    expect(renderLauncher(plain)).not.toContain('candidates')
    expect(renderLauncher(NEWEST)).toContain('"$cfg/candidates"')
  })

  test('is valid bash with onDeadLink', () => {
    const path = join(sb.root, 'launcher.sh')
    writeFileSync(path, renderLauncher(NEWEST, { builtEntry: 'bin/tooly.js' }))
    expect(spawnSync('bash', ['-n', path], { encoding: 'utf-8' }).status).toBe(0)
  })

  test('across link and list states, both pick the same checkout', () => {
    const self = launcherCheckoutFor(join(sb.root, 'self'), NEWEST)
    const b = seedCheckout(join(sb.root, 'b'))
    const c = seedCheckout(join(sb.root, 'c'))
    const notCheckout = join(sb.root, 'plain')
    mkdirSync(join(notCheckout, 'src', 'cli.ts'), { recursive: true }) // marker is a directory
    const gone = join(sb.root, 'gone')
    const cases: [string, string | null, string | null, string][] = [
      ['live link', c, `${b}\n`, c],
      ['dead link, first survivor', gone, `${gone}\n${b}\n${c}\n`, b],
      [
        'dead link, dead and non-checkout lines skipped',
        gone,
        `${gone}\n${notCheckout}\n${c}\n`,
        c,
      ],
      ['dead link, relative and empty lines skipped', gone, `\nb\n./b\n${c}\n`, c],
      ['dead link, no final newline', gone, `${gone}\n${b}`, b],
      ['dead link, a line with a trailing space is another path', gone, `${b} \n${c}\n`, c],
      ['dead link, nothing survives', gone, `${gone}\n`, self],
      ['dead link, no list', gone, null, self],
      ['dead link, empty list', gone, '', self],
      ['no link', null, `${b}\n`, self],
      ['a blank link file is no link', ' \t ', `${b}\n`, self],
      ['dead link, the survivor is this checkout', gone, `${self}\n${b}\n`, self],
    ]
    for (const [what, linked, list, expected] of cases) {
      rmSync(sb.stateDir, { recursive: true, force: true })
      seedState(linked, list)
      // The cwd is sb.root, where the relative lines `b` and `./b` would name checkout b.
      expect(tsPick(self), what).toBe(expected)
      expect(bashPick(self), what).toBe(expected)
    }
  })

  test('a list that is a directory reads as empty, without a word on stderr', () => {
    const self = launcherCheckoutFor(join(sb.root, 'self'), NEWEST)
    seedState(join(sb.root, 'gone'), null)
    mkdirSync(candidatesPath(NEWEST, state()))
    expect(tsPick(self)).toBe(self)
    expect(bashPick(self)).toBe(self)
  })

  test('a suppressor turns the fall-back off in both', () => {
    const self = launcherCheckoutFor(join(sb.root, 'self'), NEWEST)
    const b = seedCheckout(join(sb.root, 'b'))
    seedState(join(sb.root, 'gone'), `${b}\n`)
    expect(tsPick(self, { env: { TOOLY_HARNESS: '1' } })).toBe(self)
    expect(bashPick(self, sb.root, { TOOLY_HARNESS: '1' })).toBe(self)
  })

  test('the list dev link writes is the one the launcher walks', () => {
    const self = launcherCheckoutFor(join(sb.root, 'self'), NEWEST)
    const b = seedCheckout(join(sb.root, 'b'))
    const c = seedCheckout(join(sb.root, 'c'))
    link(NEWEST, { checkout: b }, opts())
    link(NEWEST, { checkout: c }, opts())
    rmSync(c, { recursive: true })
    expect(tsPick(self)).toBe(b)
    expect(bashPick(self)).toBe(b)
  })

  test('the hand-off says why, and exports the link layer', () => {
    const self = launcherCheckoutFor(join(sb.root, 'self'), NEWEST)
    const b = seedCheckout(join(sb.root, 'b'))
    const gone = join(sb.root, 'gone')
    seedState(gone, `${b}\n`)
    writeFileSync(join(fakeBin, 'bun'), '#!/bin/sh\necho "LAYER=${TOOLY_LAUNCH_LAYER-unset} $*"\n')
    const r = run(join(self, NEWEST.launcher), sb.root, { TOOLY_QUIET: '0' })
    expect(r.out).toBe(`LAYER=link --no-env-file --config=/dev/null run ${b}/src/cli.ts`)
    expect(r.err).toBe(
      `tooly: running ${b}/src/cli.ts (newest surviving checkout in ${sb.stateDir}/candidates; the link names ${gone}, which is gone)`,
    )
  })
})
