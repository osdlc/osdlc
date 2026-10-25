import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { userInfo } from 'node:os'
import { join } from 'node:path'

import { gitHead } from '../../src/devlink/git-head.ts'
import {
  DevlinkError,
  defaultBinDir,
  history,
  install,
  link,
  off,
  readShimTarget,
  renderShim,
  status,
  use,
} from '../../src/devlink/ops.ts'
import { readActive, readHistory } from '../../src/devlink/state.ts'
import { SHA_A, SHA_B, SPEC, sandbox, seedCheckout, seedGit, type Sandbox } from './support.ts'

let sb: Sandbox
let tick = 0
beforeEach(() => {
  sb = sandbox()
  tick = 0
})
afterEach(() => sb.dispose())

const opts = (extra: Record<string, unknown> = {}) => ({
  dirs: sb.dirs,
  env: {} as Record<string, string | undefined>,
  cwd: sb.root,
  now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)),
  ...extra,
})

describe('gitHead', () => {
  test('reads branch + short sha from a loose ref', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    seedGit(a, 'feature/x', SHA_A)
    expect(gitHead(a)).toEqual({ branch: 'feature/x', head: SHA_A.slice(0, 12) })
  })
  test('follows a worktree gitdir file and commondir', () => {
    const main = seedCheckout(join(sb.root, 'main'))
    seedGit(main, 'main', SHA_B)
    const wt = seedCheckout(join(sb.root, 'wt'))
    const wtGit = join(main, '.git', 'worktrees', 'wt')
    mkdirSync(wtGit, { recursive: true })
    writeFileSync(join(wt, '.git'), `gitdir: ${wtGit}\n`)
    writeFileSync(join(wtGit, 'commondir'), '../..\n')
    writeFileSync(join(wtGit, 'HEAD'), 'ref: refs/heads/main\n')
    expect(gitHead(wt)).toEqual({ branch: 'main', head: SHA_B.slice(0, 12) })
  })
  test('no .git → nulls', () => {
    expect(gitHead(sb.root)).toEqual({ branch: null, head: null })
  })
})

describe('defaultBinDir', () => {
  test('an empty HOME falls back to the account home, not a relative dir', () => {
    expect(defaultBinDir({ HOME: '' })).toMatch(/^\/.+\/\.local\/bin$/)
  })
  test('a relative XDG_BIN_HOME is ignored; an absolute one wins', () => {
    expect(defaultBinDir({ HOME: '/h', XDG_BIN_HOME: 'bin' })).toBe('/h/.local/bin')
    // A relative HOME is unset, not a folder under the cwd.
    expect(defaultBinDir({ HOME: '.' })).toBe(join(userInfo().homedir, '.local', 'bin'))
    expect(defaultBinDir({ HOME: '/h', XDG_BIN_HOME: '/x/bin' })).toBe('/x/bin')
  })
})

describe('link', () => {
  test('writes the home file and a history event with branch + head', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    seedGit(a, 'main', SHA_A)
    const out = link(SPEC, { checkout: a, label: 'first' }, opts())
    expect(out.checkout).toBe(a)
    expect(out.previous).toBeNull()
    expect(out.branch).toBe('main')
    expect(readActive(SPEC, { dirs: sb.dirs })).toBe(a)
    const events = readHistory(SPEC, { dirs: sb.dirs })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ event: 'link', checkout: a, branch: 'main', label: 'first' })
  })

  test('defaults to the checkout above the cwd, then self, else errors', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    expect(link(SPEC, {}, opts({ cwd: join(a, 'src') })).checkout).toBe(a)
    expect(link(SPEC, {}, opts({ self: a })).checkout).toBe(a)
    expect(() => link(SPEC, {}, opts())).toThrow(DevlinkError)
  })

  test('a relative checkout path resolves against opts.cwd', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    expect(link(SPEC, { checkout: 'a' }, opts({ cwd: sb.root })).checkout).toBe(a)
    expect(() => link(SPEC, { checkout: 'a' }, opts({ cwd: join(sb.root, 'elsewhere') }))).toThrow(
      /not a tooly checkout/,
    )
  })

  test('rejects a non-checkout', () => {
    expect(() => link(SPEC, { checkout: sb.root }, opts())).toThrow(/not a tooly checkout/)
    expect(existsSync(join(sb.stateDir, 'home'))).toBe(false)
  })

  test('dry-run writes nothing', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const out = link(SPEC, { checkout: a }, opts({ dryRun: true }))
    expect(out.wrote).toBe(false)
    expect(readActive(SPEC, { dirs: sb.dirs })).toBeNull()
    expect(readHistory(SPEC, { dirs: sb.dirs })).toHaveLength(0)
  })
})

describe('off / use canonical', () => {
  test('off clears the link and records it; a second off records nothing', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    link(SPEC, { checkout: a }, opts())
    const first = off(SPEC, opts())
    expect(first.previous).toBe(a)
    expect(readActive(SPEC, { dirs: sb.dirs })).toBeNull()
    const second = off(SPEC, opts())
    expect(second.previous).toBeNull()
    expect(readHistory(SPEC, { dirs: sb.dirs }).map((e) => e.event)).toEqual(['link', 'off'])
  })

  test("use 'canonical' is off", () => {
    const a = seedCheckout(join(sb.root, 'a'))
    link(SPEC, { checkout: a }, opts())
    const out = use(SPEC, { target: 'canonical' }, opts())
    expect(out.kind).toBe('canonical')
    expect(readActive(SPEC, { dirs: sb.dirs })).toBeNull()
  })
})

describe('history + use #n', () => {
  test('most recent first, one row per path, active marked, times counted', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    link(SPEC, { checkout: a }, opts())
    link(SPEC, { checkout: b }, opts())
    use(SPEC, { target: a }, opts())
    const rows = history(SPEC, opts())
    expect(rows.map((r) => r.checkout)).toEqual([a, b])
    expect(rows[0]).toMatchObject({ index: 1, active: true, times: 2, lastEvent: 'use' })
    expect(rows[1]).toMatchObject({ index: 2, active: false, times: 1, lastEvent: 'link' })
  })

  test('use #2 switches to the second entry and moves it to the top', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    link(SPEC, { checkout: a }, opts())
    link(SPEC, { checkout: b }, opts())
    const out = use(SPEC, { target: '#2' }, opts())
    expect(out.kind).toBe('checkout')
    expect(readActive(SPEC, { dirs: sb.dirs })).toBe(a)
    expect(history(SPEC, opts())[0]?.checkout).toBe(a)
    // a bare integer works too
    use(SPEC, { target: '2' }, opts())
    expect(readActive(SPEC, { dirs: sb.dirs })).toBe(b)
  })

  test('a deleted checkout stays in history as invalid and cannot be used', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    link(SPEC, { checkout: a }, opts())
    link(SPEC, { checkout: b }, opts())
    rmSync(a, { recursive: true, force: true })
    const rows = history(SPEC, opts())
    expect(rows[1]).toMatchObject({ checkout: a, valid: false })
    expect(() => use(SPEC, { target: '#2' }, opts())).toThrow(/no longer a checkout/)
  })

  test('out-of-range and empty history are clear errors', () => {
    expect(() => use(SPEC, { target: '#1' }, opts())).toThrow(/history is empty/)
    const a = seedCheckout(join(sb.root, 'a'))
    link(SPEC, { checkout: a }, opts())
    expect(() => use(SPEC, { target: '#3' }, opts())).toThrow(/no history entry #3 \(1\.\.1\)/)
  })

  test('a torn last line does not hide earlier events', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    link(SPEC, { checkout: a }, opts())
    writeFileSync(
      join(sb.stateDir, 'history.jsonl'),
      readFileSync(join(sb.stateDir, 'history.jsonl'), 'utf-8') + '{"at":"x"',
      'utf-8',
    )
    expect(history(SPEC, opts())).toHaveLength(1)
  })
})

describe('install', () => {
  test('writes an executable shim per name, idempotent, repoints an older shim', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    const bin = join(sb.root, 'bin')
    const shim = join(bin, 'tooly')
    const first = install(
      SPEC,
      { checkout: a, binDir: bin },
      opts({ env: { PATH: `${bin}:/usr/bin` } }),
    )
    expect(first.links.map((l) => [l.name, l.status])).toEqual([
      ['tooly', 'created'],
      ['tooly-long', 'created'],
    ])
    expect(first.onPath).toBe(true)
    const st = lstatSync(shim)
    expect(st.isFile()).toBe(true)
    expect(st.mode & 0o777).toBe(0o755)
    const content = readFileSync(shim, 'utf-8')
    expect(content).toContain('# devlink-shim v1')
    expect(content).toContain(first.target)
    expect(readShimTarget(shim)).toBe(realpathSync(join(a, 'bin', 'tooly')))

    const again = install(SPEC, { checkout: a, binDir: bin }, opts())
    expect(again.links.every((l) => l.status === 'exists')).toBe(true)
    expect(again.onPath).toBe(false)
    expect(lstatSync(shim).mtimeMs).toBe(st.mtimeMs)

    const moved = install(SPEC, { checkout: b, binDir: bin }, opts())
    expect(moved.links.every((l) => l.status === 'replaced')).toBe(true)
    expect(readShimTarget(shim)).toBe(realpathSync(join(b, 'bin', 'tooly')))
  })

  test('rewrites a shim that lost its execute bits', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const bin = join(sb.root, 'bin')
    install(SPEC, { checkout: a, binDir: bin }, opts())
    chmodSync(join(bin, 'tooly'), 0o644)
    const out = install(SPEC, { checkout: a, binDir: bin }, opts())
    expect(out.links[0]?.status).toBe('replaced')
    expect(lstatSync(join(bin, 'tooly')).mode & 0o777).toBe(0o755)
  })

  test('replaces a symlink with a shim', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const bin = join(sb.root, 'bin')
    mkdirSync(bin, { recursive: true })
    symlinkSync(join(a, 'bin', 'tooly'), join(bin, 'tooly'))
    const out = install(SPEC, { checkout: a, binDir: bin }, opts())
    expect(out.links[0]?.status).toBe('replaced')
    expect(lstatSync(join(bin, 'tooly')).isSymbolicLink()).toBe(false)
    expect(readShimTarget(join(bin, 'tooly'))).toBe(out.target)
  })

  test('refuses to overwrite a regular file', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const bin = join(sb.root, 'bin')
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(bin, 'tooly'), 'real file')
    expect(() => install(SPEC, { checkout: a, binDir: bin }, opts())).toThrow(DevlinkError)
    expect(readFileSync(join(bin, 'tooly'), 'utf-8')).toBe('real file')
  })

  test('dry-run creates nothing', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const bin = join(sb.root, 'bin')
    const out = install(SPEC, { checkout: a, binDir: bin }, opts({ dryRun: true }))
    expect(out.links[0]?.status).toBe('created')
    expect(existsSync(join(bin, 'tooly'))).toBe(false)
  })
})

describe('shim', () => {
  const runShim = (path: string, args: string[]) =>
    spawnSync(path, args, { encoding: 'utf-8', env: { PATH: '/usr/bin:/bin' } })

  test('passes arguments through unchanged', () => {
    const target = join(sb.root, "it's here", 'echo-args')
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, '#!/bin/sh\nprintf "[%s]" "$@"\n', { mode: 0o755 })
    const shim = join(sb.root, 'shim')
    writeFileSync(shim, renderShim(SPEC, target), { mode: 0o755 })
    expect(readShimTarget(shim)).toBe(target)
    const r = runShim(shim, ['a', "'b c'"])
    expect(r.status).toBe(0)
    expect(r.stdout).toBe("[a]['b c']")
  })

  test('exits 1 with a clear message when the target is gone', () => {
    const shim = join(sb.root, 'shim')
    writeFileSync(shim, renderShim(SPEC, join(sb.root, 'gone', 'tooly')), { mode: 0o755 })
    const r = runShim(shim, [])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('no longer exists')
    expect(r.stderr).toContain('tooly dev install')
  })

  test('readShimTarget is null for anything that is not a shim', () => {
    writeFileSync(join(sb.root, 'plain'), '#!/bin/sh\necho hi\n')
    expect(readShimTarget(join(sb.root, 'plain'))).toBeNull()
    expect(readShimTarget(join(sb.root, 'missing'))).toBeNull()
  })
})

describe('status', () => {
  test('reports every layer', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    link(SPEC, { checkout: b }, opts())
    const s = status(SPEC, opts({ cwd: a, self: a, env: { TOOLY_HARNESS: '1', PATH: '/nowhere' } }))
    expect(s.selection.source).toBe('local')
    expect(s.cwd).toMatchObject({ checkout: a, suppressed: true })
    expect(s.link).toMatchObject({ value: b, valid: true, suppressed: true })
    expect(s.self).toBe(a)
    expect(s.history.entries).toBe(1)
    expect(s.path.names.map((n) => n.found)).toEqual([null, null])
    expect(s.shim).toBeNull()
  })

  test('reports the checkout and head behind a PATH shim, or a missing target', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    seedGit(a, 'main', SHA_A)
    const bin = join(sb.root, 'bin')
    install(SPEC, { checkout: a, binDir: bin }, opts())
    const env = { PATH: bin }
    expect(status(SPEC, opts({ env })).shim).toEqual({
      path: join(bin, 'tooly'),
      target: join(a, 'bin', 'tooly'),
      targetExists: true,
      checkout: a,
      head: SHA_A.slice(0, 12),
    })
    rmSync(a, { recursive: true, force: true })
    expect(status(SPEC, opts({ env })).shim).toMatchObject({ targetExists: false, head: null })
  })
})
