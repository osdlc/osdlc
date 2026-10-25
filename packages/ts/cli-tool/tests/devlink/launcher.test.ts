/**
 * The rendered bash launcher and `resolve()` must pick the same checkout for
 * the same files and environment. A fake `bun` on PATH records what it was asked to run, so
 * each layer is driven through the real script.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { launcherCheckout, launcherDrift, renderLauncher } from '../../src/devlink/launcher.ts'
import { resolve } from '../../src/devlink/resolve.ts'
import { writeActive } from '../../src/devlink/state.ts'
import { SPEC, sandbox, seedCheckout, type Sandbox } from './support.ts'

/** What the fake bun prints for a run: the flags that keep Bun off the cwd's config. */
const BUN_RUN = 'BUN --no-env-file --config=/dev/null run'

let sb: Sandbox
let fakeBin: string
beforeEach(() => {
  sb = sandbox()
  fakeBin = join(sb.root, 'fakebin')
  mkdirSync(fakeBin, { recursive: true })
  // `bun run <entry> args…` → prints "BUN <entry> args…" so the test can read the choice.
  writeFileSync(join(fakeBin, 'bun'), '#!/bin/sh\necho "BUN $*"\n')
  chmodSync(join(fakeBin, 'bun'), 0o755)
})
afterEach(() => sb.dispose())

/** A checkout whose launcher is the real render. */
function checkoutWithLauncher(dir: string): string {
  seedCheckout(dir)
  writeFileSync(join(dir, SPEC.launcher), renderLauncher(SPEC))
  chmodSync(join(dir, SPEC.launcher), 0o755)
  return dir
}

function run(launcher: string, cwd: string, env: Record<string, string> = {}) {
  const r = spawnSync('bash', [launcher, 'arg1', 'arg two'], {
    cwd,
    encoding: 'utf-8',
    env: { HOME: sb.home, PATH: `${fakeBin}:/usr/bin:/bin`, TOOLY_QUIET: '1', ...env },
  })
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() }
}

describe('renderLauncher', () => {
  test('is valid bash', () => {
    const path = join(sb.root, 'launcher.sh')
    writeFileSync(path, renderLauncher(SPEC, { builtEntry: 'bin/tooly.js' }))
    const r = spawnSync('bash', ['-n', path], { encoding: 'utf-8' })
    expect(r.status).toBe(0)
  })

  test('launcherDrift is null for a committed render and names a stale one', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    expect(launcherDrift(SPEC, a)).toBeNull()
    writeFileSync(join(a, SPEC.launcher), '#!/bin/sh\necho stale\n')
    expect(launcherDrift(SPEC, a)).toMatch(/differs/)
  })
})

describe('bash launcher without the cwd layer', () => {
  // SPEC with `cwdLayer` left unset, the default.
  const { cwdLayer: _on, ...OFF } = SPEC

  test('standing in another checkout runs self, as resolve() does', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    writeFileSync(join(a, OFF.launcher), renderLauncher(OFF))
    chmodSync(join(a, OFF.launcher), 0o755)
    const b = seedCheckout(join(sb.root, 'b'))
    const r = run(join(a, OFF.launcher), join(b, 'src'))
    expect(r.out).toBe(`${BUN_RUN} ${a}/src/cli.ts arg1 arg two`)
    expect(resolve(OFF, { dirs: sb.dirs, env: {}, cwd: join(b, 'src'), self: a }).source).toBe(
      'local',
    )
  })

  test('renderLauncher rejects a spec with packageName', () => {
    expect(() => renderLauncher({ ...SPEC, packageName: '@example/tooly' })).toThrow(/packageName/)
  })
})

describe('bash launcher agrees with resolve()', () => {
  test('local: nothing set runs self under bun', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    const r = run(join(a, SPEC.launcher), sb.root)
    expect(r.code).toBe(0)
    expect(r.out).toBe(`${BUN_RUN} ${a}/src/cli.ts arg1 arg two`)
    expect(resolve(SPEC, { dirs: sb.dirs, env: {}, cwd: sb.root, self: a }).source).toBe('local')
  })

  test('env: TOOLY_HOME wins, even under a suppressor', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    const r = run(join(a, SPEC.launcher), sb.root, { TOOLY_HOME: b, TOOLY_HARNESS: '1' })
    expect(r.out).toBe(`${BUN_RUN} ${b}/src/cli.ts arg1 arg two`)
    const sel = resolve(SPEC, {
      dirs: sb.dirs,
      env: { TOOLY_HOME: b, TOOLY_HARNESS: '1' },
      cwd: sb.root,
      self: a,
    })
    expect(sel.source).toBe('env')
  })

  test('env: a relative TOOLY_HOME is ignored, in bash and in resolve()', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    seedCheckout(join(sb.root, 'b'))
    // From sb.root, `b` would name checkout b.
    const r = run(join(a, SPEC.launcher), sb.root, { TOOLY_HOME: 'b' })
    expect(r.out).toBe(`${BUN_RUN} ${a}/src/cli.ts arg1 arg two`)
    const sel = resolve(SPEC, { dirs: sb.dirs, env: { TOOLY_HOME: 'b' }, cwd: sb.root, self: a })
    expect(sel.source).toBe('local')
  })

  test('cwd: standing in another checkout runs that one', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    const r = run(join(a, SPEC.launcher), join(b, 'src'))
    expect(r.out).toBe(`${BUN_RUN} ${b}/src/cli.ts arg1 arg two`)
    expect(resolve(SPEC, { dirs: sb.dirs, env: {}, cwd: join(b, 'src'), self: a }).source).toBe(
      'cwd',
    )
  })

  test('cwd walks the physical directory, not a logical $PWD through a symlink', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    const plain = join(sb.root, 'plain')
    mkdirSync(plain)
    // Logically b/via sits inside checkout b; physically it is `plain`, outside any checkout.
    const via = join(b, 'via')
    symlinkSync(plain, via)
    const r = run(join(a, SPEC.launcher), via, { PWD: via })
    expect(r.out).toBe(`${BUN_RUN} ${a}/src/cli.ts arg1 arg two`)
    expect(resolve(SPEC, { dirs: sb.dirs, env: {}, cwd: plain, self: a }).source).toBe('local')
  })

  test('a marker that is a directory is not a checkout, in bash or in resolve()', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    const d = join(sb.root, 'd')
    mkdirSync(join(d, 'src', 'cli.ts'), { recursive: true })
    const r = run(join(a, SPEC.launcher), d)
    expect(r.out).toBe(`${BUN_RUN} ${a}/src/cli.ts arg1 arg two`)
    expect(resolve(SPEC, { dirs: sb.dirs, env: {}, cwd: d, self: a }).source).toBe('local')
  })

  describe('link layer without a usable config directory', () => {
    /** Runs the launcher with `uname` reporting `os` and `HOME` as given (unset when undefined). */
    function runLinux(
      launcher: string,
      home: string | undefined,
      extra: Record<string, string>,
      os = 'Linux',
    ) {
      writeFileSync(join(fakeBin, 'uname'), `#!/bin/sh\necho ${os}\n`)
      chmodSync(join(fakeBin, 'uname'), 0o755)
      const env: Record<string, string> = {
        PATH: `${fakeBin}:/usr/bin:/bin`,
        TOOLY_QUIET: '1',
        ...extra,
      }
      if (home !== undefined) env['HOME'] = home
      const r = spawnSync('bash', [launcher], { cwd: sb.root, encoding: 'utf-8', env })
      return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() }
    }

    test('an unset HOME does not abort under set -u', () => {
      const a = checkoutWithLauncher(join(sb.root, 'a'))
      const r = runLinux(join(a, SPEC.launcher), undefined, {})
      expect(r.err).toBe('')
      expect(r.out).toBe(`${BUN_RUN} ${a}/src/cli.ts`)
    })

    test('a relative HOME is never read from the cwd, on Linux or macOS', () => {
      const a = checkoutWithLauncher(join(sb.root, 'a'))
      const b = seedCheckout(join(sb.root, 'b'))
      // Link files a repository could ship, found from the cwd with HOME=.
      for (const dir of [
        join('.config', 'tooly'),
        join('Library', 'Application Support', 'tooly'),
      ]) {
        mkdirSync(join(sb.root, dir), { recursive: true })
        writeFileSync(join(sb.root, dir, 'home'), `${b}\n`)
      }
      for (const os of ['Linux', 'Darwin']) {
        const r = runLinux(join(a, SPEC.launcher), '.', {}, os)
        expect(r.out).toBe(`${BUN_RUN} ${a}/src/cli.ts`)
      }
    })

    test('a drive path in TOOLY_HOME counts only under Windows bash', () => {
      const a = checkoutWithLauncher(join(sb.root, 'a'))
      // On a POSIX system `C:/x` is a relative path, here a checkout under the cwd.
      const drive = seedCheckout(join(sb.root, 'C:', 'x'))
      const linux = runLinux(join(a, SPEC.launcher), sb.home, { TOOLY_HOME: 'C:/x' })
      expect(linux.out).toBe(`${BUN_RUN} ${a}/src/cli.ts`)
      const mingw = runLinux(join(a, SPEC.launcher), sb.home, { TOOLY_HOME: 'C:/x' }, 'MINGW64_NT')
      expect(mingw.out).toBe(`${BUN_RUN} ${realpathSync(drive)}/src/cli.ts`)
    })

    test('a relative XDG_CONFIG_HOME is ignored, as resolve() ignores it', () => {
      const a = checkoutWithLauncher(join(sb.root, 'a'))
      const b = seedCheckout(join(sb.root, 'b'))
      // A link under the relative dir, from the cwd the launcher runs in; it must not be read.
      mkdirSync(join(sb.root, 'rel', 'tooly'), { recursive: true })
      writeFileSync(join(sb.root, 'rel', 'tooly', 'home'), `${b}\n`)
      const r = runLinux(join(a, SPEC.launcher), sb.home, { XDG_CONFIG_HOME: 'rel' })
      expect(r.out).toBe(`${BUN_RUN} ${a}/src/cli.ts`)
    })

    test('an absolute XDG_CONFIG_HOME is honoured', () => {
      const a = checkoutWithLauncher(join(sb.root, 'a'))
      const b = seedCheckout(join(sb.root, 'b'))
      mkdirSync(join(sb.root, 'xdg', 'tooly'), { recursive: true })
      writeFileSync(join(sb.root, 'xdg', 'tooly', 'home'), `${b}\n`)
      const r = runLinux(join(a, SPEC.launcher), sb.home, { XDG_CONFIG_HOME: join(sb.root, 'xdg') })
      expect(r.out).toBe(`${BUN_RUN} ${b}/src/cli.ts`)
    })
  })

  test('a checkout with a package.json but no node_modules fails with a hint', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    writeFileSync(join(b, 'package.json'), '{}\n')
    const r = run(join(a, SPEC.launcher), join(b, 'src'))
    expect(r.code).toBe(1)
    expect(r.out).toBe('')
    expect(r.err).toBe(`tooly: ${b} has no node_modules. Run 'bun install' there.`)
    mkdirSync(join(b, 'node_modules'))
    expect(run(join(a, SPEC.launcher), join(b, 'src')).out).toBe(
      `${BUN_RUN} ${b}/src/cli.ts arg1 arg two`,
    )
  })

  test('a checkout missing one declared package fails with a hint, not a stack trace', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    writeFileSync(
      join(b, 'package.json'),
      '{\n  "name": "b",\n  "dependencies": {\n    "present-pkg": "^1.0.0",\n    "@scope/gone": "^2.0.0"\n  },\n  "devDependencies": {\n    "dev-only": "^1.0.0"\n  }\n}\n',
    )
    mkdirSync(join(b, 'node_modules', 'present-pkg'), { recursive: true })
    const r = run(join(a, SPEC.launcher), join(b, 'src'))
    expect(r.code).toBe(1)
    expect(r.out).toBe('')
    expect(r.err).toBe(`tooly: ${b} is missing package '@scope/gone'. Run 'bun install' there.`)
    // Installing it (anywhere up to the checkout root) clears the hint; devDependencies are not checked.
    mkdirSync(join(b, 'node_modules', '@scope', 'gone'), { recursive: true })
    const ok = run(join(a, SPEC.launcher), join(b, 'src'))
    expect(ok.code).toBe(0)
    expect(ok.err).toBe('')
    expect(ok.out).toBe(`${BUN_RUN} ${b}/src/cli.ts arg1 arg two`)
  })

  test('one-line dependencies blocks are read, and never spill into devDependencies', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    mkdirSync(join(b, 'node_modules'))
    writeFileSync(
      join(b, 'package.json'),
      '{\n  "dependencies": {},\n  "devDependencies": {\n    "dev-only": "^1.0.0"\n  }\n}\n',
    )
    const empty = run(join(a, SPEC.launcher), join(b, 'src'))
    expect(empty.code).toBe(0)
    expect(empty.err).toBe('')
    writeFileSync(
      join(b, 'package.json'),
      '{"dependencies": {"one": "1", "@s/two": "2"}, "devDependencies": {"dev-only": "1"}}\n',
    )
    mkdirSync(join(b, 'node_modules', 'one'))
    const r = run(join(a, SPEC.launcher), join(b, 'src'))
    expect(r.code).toBe(1)
    expect(r.err).toBe(`tooly: ${b} is missing package '@s/two'. Run 'bun install' there.`)
    mkdirSync(join(b, 'node_modules', '@s', 'two'), { recursive: true })
    const ok = run(join(a, SPEC.launcher), join(b, 'src'))
    expect(ok.code).toBe(0)
    expect(ok.err).toBe('')
  })

  test('a package.json with no dependencies block passes', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    mkdirSync(join(b, 'node_modules'))
    writeFileSync(
      join(b, 'package.json'),
      '{\n  "name": "b",\n  "devDependencies": {\n    "x": "1"\n  }\n}\n',
    )
    const r = run(join(a, SPEC.launcher), join(b, 'src'))
    expect(r.code).toBe(0)
    expect(r.err).toBe('')
    expect(r.out).toBe(`${BUN_RUN} ${b}/src/cli.ts arg1 arg two`)
  })

  test('a nested package between the entry and the root is checked, and resolves from its own node_modules', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    mkdirSync(join(b, 'node_modules'))
    writeFileSync(join(b, 'package.json'), '{\n  "dependencies": {\n    "root-dep": "1"\n  }\n}\n')
    mkdirSync(join(b, 'node_modules', 'root-dep'))
    // `src/package.json` sits between the entry (src/cli.ts) and the root.
    writeFileSync(
      join(b, 'src', 'package.json'),
      '{\n  "dependencies": {\n    "nested-dep": "1"\n  }\n}\n',
    )
    const miss = run(join(a, SPEC.launcher), join(b, 'src'))
    expect(miss.code).toBe(1)
    expect(miss.out).toBe('')
    expect(miss.err).toBe(`tooly: ${b} is missing package 'nested-dep'. Run 'bun install' there.`)
    // Satisfied only from the nested package's own node_modules, not the root's.
    mkdirSync(join(b, 'src', 'node_modules', 'nested-dep'), { recursive: true })
    const ok = run(join(a, SPEC.launcher), join(b, 'src'))
    expect(ok.code).toBe(0)
    expect(ok.err).toBe('')
    expect(ok.out).toBe(`${BUN_RUN} ${b}/src/cli.ts arg1 arg two`)
  })

  test('a nested dependency is satisfied from an intermediate node_modules, not the root', () => {
    const deep = { ...SPEC, marker: 'pkg/app/src/cli.ts' }
    mkdirSync(join(sb.root, 'a', 'pkg', 'app', 'src'), { recursive: true })
    const a = seedCheckout(join(sb.root, 'a'), deep)
    writeFileSync(join(a, SPEC.launcher), renderLauncher(deep))
    chmodSync(join(a, SPEC.launcher), 0o755)
    const b = join(sb.root, 'b')
    mkdirSync(join(b, 'pkg', 'app', 'src'), { recursive: true })
    seedCheckout(b, deep)
    mkdirSync(join(b, 'node_modules'))
    writeFileSync(join(b, 'package.json'), '{}\n')
    // The checked package sits above the entry; its dependency lives one level up, in
    // `pkg/node_modules`, which is neither the package's own nor the root's.
    writeFileSync(
      join(b, 'pkg', 'app', 'package.json'),
      '{\n  "dependencies": {\n    "mid-dep": "1"\n  }\n}\n',
    )
    const miss = run(join(a, SPEC.launcher), sb.root, { TOOLY_HOME: b })
    expect(miss.code).toBe(1)
    expect(miss.err).toBe(`tooly: ${b} is missing package 'mid-dep'. Run 'bun install' there.`)
    mkdirSync(join(b, 'pkg', 'node_modules', 'mid-dep'), { recursive: true })
    const ok = run(join(a, SPEC.launcher), sb.root, { TOOLY_HOME: b })
    expect(ok.code).toBe(0)
    expect(ok.err).toBe('')
    expect(ok.out).toBe(`${BUN_RUN} ${b}/pkg/app/src/cli.ts arg1 arg two`)
  })

  test('link: the home file redirects; a suppressor turns it off', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    writeActive(SPEC, b, { dirs: sb.dirs })
    expect(run(join(a, SPEC.launcher), sb.root).out).toBe(`${BUN_RUN} ${b}/src/cli.ts arg1 arg two`)
    expect(run(join(a, SPEC.launcher), sb.root, { TOOLY_HARNESS: '' }).out).toBe(
      `${BUN_RUN} ${a}/src/cli.ts arg1 arg two`,
    )
    expect(resolve(SPEC, { dirs: sb.dirs, env: {}, cwd: sb.root, self: a }).source).toBe('link')
    expect(
      resolve(SPEC, { dirs: sb.dirs, env: { TOOLY_HARNESS: '' }, cwd: sb.root, self: a }).source,
    ).toBe('local')
  })

  test('a link to self is the local no-op, and a symlinked launcher resolves its real home', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    writeActive(SPEC, a, { dirs: sb.dirs })
    const bin = join(sb.root, 'bin')
    mkdirSync(bin, { recursive: true })
    symlinkSync(join(a, SPEC.launcher), join(bin, 'tooly'))
    const r = run(join(bin, 'tooly'), sb.root)
    expect(r.out).toBe(`${BUN_RUN} ${a}/src/cli.ts arg1 arg two`)
  })

  test('a built sibling runs under node when present', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    writeFileSync(join(a, SPEC.launcher), renderLauncher(SPEC, { builtEntry: 'bin/tooly.js' }))
    chmodSync(join(a, SPEC.launcher), 0o755)
    writeFileSync(join(a, 'bin', 'tooly.js'), '')
    writeFileSync(join(fakeBin, 'node'), '#!/bin/sh\necho "NODE $*"\n')
    chmodSync(join(fakeBin, 'node'), 0o755)
    expect(run(join(a, SPEC.launcher), sb.root).out).toBe(
      `${BUN_RUN} ${a}/src/cli.ts arg1 arg two`
        .replace(BUN_RUN, 'NODE')
        .replace('src/cli.ts', 'bin/tooly.js'),
    )
  })

  test('a dev checkout (node_modules + bun on PATH) skips the built entry', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    mkdirSync(join(a, 'node_modules'), { recursive: true })
    writeFileSync(join(a, SPEC.launcher), renderLauncher(SPEC, { builtEntry: 'bin/tooly.js' }))
    chmodSync(join(a, SPEC.launcher), 0o755)
    writeFileSync(join(a, 'bin', 'tooly.js'), '')
    writeFileSync(join(fakeBin, 'node'), '#!/bin/sh\necho "NODE $*"\n')
    chmodSync(join(fakeBin, 'node'), 0o755)
    expect(run(join(a, SPEC.launcher), sb.root).out).toBe(`${BUN_RUN} ${a}/src/cli.ts arg1 arg two`)
  })

  test('node_modules present but bun ABSENT still takes the built entry under node (dev_checkout needs BOTH)', () => {
    // The `beforeEach` above puts a fake `bun` on PATH for every other test
    // in this file, so none of them reach this branch. A partly set up dev
    // checkout (installed, but bun not yet on PATH) must still use the built
    // entry. The dev_checkout check must not treat "node_modules present"
    // alone as enough.
    const a = seedCheckout(join(sb.root, 'a'))
    mkdirSync(join(a, 'node_modules'), { recursive: true })
    writeFileSync(join(a, SPEC.launcher), renderLauncher(SPEC, { builtEntry: 'bin/tooly.js' }))
    chmodSync(join(a, SPEC.launcher), 0o755)
    writeFileSync(join(a, 'bin', 'tooly.js'), '')
    const nodeOnlyBin = join(sb.root, 'nodeonlybin')
    mkdirSync(nodeOnlyBin, { recursive: true })
    writeFileSync(join(nodeOnlyBin, 'node'), '#!/bin/sh\necho "NODE $*"\n')
    chmodSync(join(nodeOnlyBin, 'node'), 0o755)
    // Overrides the default PATH from `run()` (which always has `fakeBin`,
    // and therefore `bun`, on it) with one that has `node` but no `bun`
    // anywhere on it.
    const r = run(join(a, SPEC.launcher), sb.root, {
      PATH: `${nodeOnlyBin}:/usr/bin:/bin`,
      TOOLY_QUIET: '0',
    })
    expect(r.out).toBe(
      `${BUN_RUN} ${a}/src/cli.ts arg1 arg two`
        .replace(BUN_RUN, 'NODE')
        .replace('src/cli.ts', 'bin/tooly.js'),
    )
    expect(r.err).toBe(`tooly: running ${a}/bin/tooly.js (local, node)`)
  })

  test('announces on stderr unless quiet', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    const r = spawnSync('bash', [join(a, SPEC.launcher)], {
      cwd: sb.root,
      encoding: 'utf-8',
      env: { HOME: sb.home, PATH: `${fakeBin}:/usr/bin:/bin` },
    })
    expect(r.stderr.trim()).toBe(`tooly: running ${a}/src/cli.ts (local, bun)`)
  })
})

describe('bash launcher finds bun and node on absolute PATH entries only', () => {
  /** A repository the user stands in, with its own `bin/bun` and `bin/node`. */
  function hostileRepo(): string {
    const repo = join(sb.root, 'repo')
    mkdirSync(join(repo, 'bin'), { recursive: true })
    for (const name of ['bun', 'node']) {
      writeFileSync(join(repo, 'bin', name), '#!/bin/sh\necho REPO_RAN\n')
      chmodSync(join(repo, 'bin', name), 0o755)
    }
    return repo
  }

  /** A folder with only the utilities the launcher needs, so no real bun or node is found. */
  function utilities(): string {
    const dir = join(sb.root, 'utilities')
    mkdirSync(dir, { recursive: true })
    for (const name of ['bash', 'dirname', 'readlink', 'uname', 'cat', 'id', 'awk']) {
      const found = spawnSync('bash', ['-c', `command -v ${name}`], { encoding: 'utf-8' })
      symlinkSync(found.stdout.trim(), join(dir, name))
    }
    return dir
  }

  test('a bun on a relative PATH entry never runs for a selected checkout', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    const repo = hostileRepo()
    const util = utilities()
    const missing = run(join(a, SPEC.launcher), repo, { TOOLY_HOME: b, PATH: `bin:${util}` })
    expect(missing.out).not.toContain('REPO_RAN')
    expect(missing.code).toBe(1)
    expect(missing.err).toContain('needs bun on an absolute PATH entry')
    const found = run(join(a, SPEC.launcher), repo, {
      TOOLY_HOME: b,
      PATH: `bin:${fakeBin}:${util}`,
    })
    expect(found.out).toBe(`${BUN_RUN} ${b}/src/cli.ts arg1 arg two`)
  })

  test('a bun or node on a relative PATH entry never runs for the local entry', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    writeFileSync(join(a, SPEC.launcher), renderLauncher(SPEC, { builtEntry: 'bin/tooly.js' }))
    chmodSync(join(a, SPEC.launcher), 0o755)
    writeFileSync(join(a, 'bin', 'tooly.js'), '')
    const repo = hostileRepo()
    const util = utilities()
    const r = run(join(a, SPEC.launcher), repo, { PATH: `.:bin:${util}` })
    expect(r.out).not.toContain('REPO_RAN')
    expect(r.code).toBe(1)
    expect(r.err).toContain("'node' is not on an absolute PATH entry")
    const src = checkoutWithLauncher(join(sb.root, 'src-only'))
    const s = run(join(src, SPEC.launcher), repo, { PATH: `bin:${util}` })
    expect(s.out).not.toContain('REPO_RAN')
    expect(s.err).toContain('needs bun on an absolute PATH entry')
  })
})

describe('the exported launch layer', () => {
  /** A fake `bun` that reports the layer the launcher exported. */
  function layerOf(launcher: string, cwd: string, env: Record<string, string> = {}): string {
    writeFileSync(join(fakeBin, 'bun'), '#!/bin/sh\necho "LAYER=${TOOLY_LAUNCH_LAYER-unset}"\n')
    return run(launcher, cwd, env).out
  }

  test('local when nothing selects another checkout', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    expect(layerOf(join(a, SPEC.launcher), sb.root)).toBe('LAYER=local')
  })

  test('env, cwd and link name the layer that chose another checkout', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    const launcher = join(a, SPEC.launcher)
    expect(layerOf(launcher, sb.root, { TOOLY_HOME: b })).toBe('LAYER=env')
    expect(layerOf(launcher, join(b, 'src'))).toBe('LAYER=cwd')
    writeActive(SPEC, b, { dirs: sb.dirs })
    expect(layerOf(launcher, sb.root)).toBe('LAYER=link')
  })

  test("a layer that selects the launcher's own checkout reads as local", () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    expect(layerOf(join(a, SPEC.launcher), sb.root, { TOOLY_HOME: a })).toBe('LAYER=local')
    expect(layerOf(join(a, SPEC.launcher), join(a, 'src'))).toBe('LAYER=local')
  })

  test('the built-entry exec exports it too', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    writeFileSync(join(a, SPEC.launcher), renderLauncher(SPEC, { builtEntry: 'bin/tooly.js' }))
    chmodSync(join(a, SPEC.launcher), 0o755)
    writeFileSync(join(a, 'bin', 'tooly.js'), '')
    writeFileSync(join(fakeBin, 'node'), '#!/bin/sh\necho "LAYER=${TOOLY_LAUNCH_LAYER-unset}"\n')
    chmodSync(join(fakeBin, 'node'), 0o755)
    expect(run(join(a, SPEC.launcher), sb.root).out).toBe('LAYER=local')
  })
})

describe('launcherCheckout', () => {
  test('is the checkout root of a launcher, through a symlink', () => {
    const co = checkoutWithLauncher(join(sb.root, 'co'))
    const link = join(sb.root, 'path-bin', 'tooly')
    mkdirSync(join(sb.root, 'path-bin'), { recursive: true })
    symlinkSync(join(co, SPEC.launcher), link)
    expect(launcherCheckout(SPEC, link)).toBe(co)
  })

  test('is null for a launcher that does not exist', () => {
    expect(launcherCheckout(SPEC, join(sb.root, 'nope'))).toBeNull()
  })

  test('agrees with the rendered launcher: a layer naming it resolves local', () => {
    const co = checkoutWithLauncher(join(sb.root, 'co'))
    const self = launcherCheckout(SPEC, join(co, SPEC.launcher))
    expect(resolve(SPEC, { dirs: sb.dirs, cwd: co, env: {}, self }).source).toBe('local')
  })
})
