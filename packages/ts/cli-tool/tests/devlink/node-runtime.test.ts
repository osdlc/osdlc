/**
 * `runtime: 'node'`: a selected checkout runs its entry under node instead of
 * bun, a TypeScript entry through Node's own type stripping (22.18 or later).
 * `dev link` and `dev use` refuse a checkout whose entry cannot run that way.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { devNull } from 'node:os'
import { join } from 'node:path'

import { captureIo, type CliContext } from '../../src/index.ts'
import { runDevCli, type CliIo } from '../../src/devlink/cli.ts'
import { entryProblem, isTypeScriptEntry, stripsTypes } from '../../src/devlink/entry.ts'
import { execSelection } from '../../src/devlink/exec.ts'
import { devlinkHook } from '../../src/devlink/hook.ts'
import { renderLauncher } from '../../src/devlink/launcher.ts'
import { DevlinkError, link, use } from '../../src/devlink/ops.ts'
import { resolve, type Selected } from '../../src/devlink/resolve.ts'
import { validateSpec, type ToolSpec } from '../../src/devlink/spec.ts'
import { readActive, readHistory, writeActive } from '../../src/devlink/state.ts'
import { SPEC, sandbox, seedCheckout, type Sandbox } from './support.ts'

const NSPEC: ToolSpec = { ...SPEC, runtime: 'node' }

let sb: Sandbox
beforeEach(() => {
  sb = sandbox()
})
afterEach(() => sb.dispose())

/** An executable at `root/<name>` running `body` under sh. */
function script(name: string, body: string): string {
  const path = join(sb.root, name)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
  return path
}

/** A fake `node` that answers `--version` with `version`. */
function nodeOf(version: string): string {
  return script(`node-${version}/node`, `[ "$1" = "--version" ] && echo ${version}`)
}

const opts = (extra: Record<string, unknown> = {}) => ({
  dirs: sb.dirs,
  env: {} as Record<string, string | undefined>,
  cwd: sb.root,
  now: () => new Date(Date.UTC(2026, 0, 1)),
  ...extra,
})

describe('validateSpec', () => {
  test('accepts bun and node, and no runtime', () => {
    for (const spec of [SPEC, NSPEC, { ...SPEC, runtime: 'bun' as const }]) {
      expect(validateSpec(spec)).toBe(spec)
    }
  })

  test('refuses any other runtime', () => {
    expect(() => validateSpec({ ...SPEC, runtime: 'deno' as 'node' })).toThrow(
      /runtime must be 'bun' or 'node', got "deno"/,
    )
  })

  test.each(['src/cli.tsx', 'src/cli.jsx'])(
    'refuses the node entry %s, which node cannot run',
    (entry) => {
      expect(() => validateSpec({ ...NSPEC, entry })).toThrow(/node cannot run a JSX entry/)
      // Bun runs JSX, so the same entry is fine there.
      expect(validateSpec({ ...SPEC, entry })).toBeTruthy()
    },
  )
})

describe('resolve', () => {
  test('a checkout selection carries the spec runtime, bun by default', () => {
    const b = seedCheckout(join(sb.root, 'b'))
    const env = { TOOLY_HOME: b }
    expect(resolve(SPEC, { dirs: sb.dirs, env, cwd: sb.root })).toMatchObject({
      source: 'env',
      runtime: 'bun',
    })
    expect(resolve(NSPEC, { dirs: sb.dirs, env, cwd: sb.root })).toMatchObject({
      source: 'env',
      entry: join(b, 'src', 'cli.ts'),
      runtime: 'node',
    })
  })
})

describe('execSelection under node', () => {
  const selection: Selected = {
    source: 'link',
    checkout: '/x',
    entry: '/x/src/cli.ts',
    reason: 'linked checkout',
    runtime: 'node',
  }

  interface Call {
    file: string
    args: string[]
    env: Record<string, string>
  }

  test('a checkout is replaced by node given the entry, with no bun flags', () => {
    const calls: Call[] = []
    const code = execSelection(NSPEC, selection, ['list', '-x'], {
      env: { TOOLY_QUIET: '1' },
      node: '/opt/node',
      bun: '/opt/bun',
      execve: (file, args, env) => calls.push({ file, args, env }),
    })
    expect(code).toBe(0)
    expect(calls).toEqual([
      {
        file: '/opt/node',
        args: ['/opt/node', '/x/src/cli.ts', 'list', '-x'],
        env: { TOOLY_QUIET: '1', TOOLY_LAUNCH_LAYER: 'link' },
      },
    ])
  })

  test('a selection without a runtime takes the spec runtime', () => {
    const { runtime: _r, ...bare } = selection
    const files: string[] = []
    const run = (spec: ToolSpec) =>
      execSelection(spec, bare, [], {
        env: { TOOLY_QUIET: '1' },
        node: '/opt/node',
        bun: '/opt/bun',
        execve: (file) => files.push(file),
      })
    run(NSPEC)
    run(SPEC)
    expect(files).toEqual(['/opt/node', '/opt/bun'])
  })

  test("a project copy keeps its own runtime, whatever the spec's", () => {
    const calls: Call[] = []
    const project: Selected = {
      source: 'project',
      checkout: '/p/node_modules/tooly',
      entry: '/p/node_modules/tooly/bin/tooly.js',
      reason: 'project install',
      runtime: 'bun',
      version: '2.0.0',
    }
    execSelection(NSPEC, project, [], {
      env: { TOOLY_QUIET: '1' },
      node: '/opt/node',
      bun: '/opt/bun',
      execve: (file, args, env) => calls.push({ file, args, env }),
    })
    expect(calls[0]?.args).toEqual([
      '/opt/bun',
      '--no-env-file',
      `--config=${devNull}`,
      'run',
      '/p/node_modules/tooly/bin/tooly.js',
    ])
  })

  test('a node that cannot start returns 1 and points at dev off', () => {
    const notExecutable = join(sb.root, 'plain-node')
    writeFileSync(notExecutable, '#!/bin/sh\nexit 0\n', { mode: 0o644 })
    for (const node of [join(sb.root, 'no-such-node'), notExecutable]) {
      const lines: string[] = []
      const code = execSelection(NSPEC, selection, [], {
        env: {},
        node,
        execve: undefined,
        announce: (line) => lines.push(line),
      })
      expect(code).toBe(1)
      expect(lines).toEqual([
        'tooly: running /x/src/cli.ts (linked checkout)',
        expect.stringContaining(
          `tooly: the selected checkout runs from source under node and could not start ${node} (`,
        ),
      ])
      expect(lines[1]).toContain("run 'tooly dev off' to use the local install")
    }
  })

  test('a signalled node returns 128 plus the signal number, an exit code passes through', () => {
    const quiet = { env: { TOOLY_QUIET: '1' }, execve: undefined }
    const killed = script('killed/node', 'kill -TERM $$')
    expect(execSelection(NSPEC, selection, [], { ...quiet, node: killed })).toBe(143)
    const seven = script('seven/node', 'exit 7')
    expect(execSelection(NSPEC, selection, [], { ...quiet, node: seven })).toBe(7)
  })

  test('a real node runs a TypeScript checkout from source, with relative .ts imports', () => {
    const co = seedCheckout(join(sb.root, 'co'))
    const report = join(sb.root, 'report.json')
    writeFileSync(join(co, 'package.json'), JSON.stringify({ name: 'co', type: 'module' }))
    writeFileSync(
      join(co, 'src', 'greet.ts'),
      'export const greet = (n: string): string => `hi ${n}`\n',
    )
    writeFileSync(
      join(co, 'src', 'cli.ts'),
      "import { writeFileSync } from 'node:fs'\n" +
        "import { greet } from './greet.ts'\n" +
        'const args: string[] = process.argv.slice(2)\n' +
        `writeFileSync(${JSON.stringify(report)}, JSON.stringify({ out: greet(args[0] ?? ''), layer: process.env.TOOLY_LAUNCH_LAYER }))\n`,
    )
    const code = execSelection(
      NSPEC,
      { ...selection, checkout: co, entry: join(co, 'src', 'cli.ts') },
      ['you'],
      { env: { TOOLY_QUIET: '1' }, node: process.execPath, execve: undefined },
    )
    expect(code).toBe(0)
    expect(JSON.parse(readFileSync(report, 'utf-8'))).toEqual({ out: 'hi you', layer: 'link' })
  })
})

describe('the entry check', () => {
  test.each<[string, boolean]>([
    ['v22.17.1', false],
    ['v22.18.0', true],
    ['22.19.3', true],
    ['v23.5.0', false],
    ['v23.6.0', true],
    ['v24.0.0', true],
    ['v26.1.0', true],
    ['v20.19.0', false],
    ['v21.7.3', false],
    ['  v22.18.0\n', true],
    ['', false],
    ['not a version', false],
  ])('stripsTypes(%j) is %s', (version, expected) => {
    expect(stripsTypes(version)).toBe(expected)
  })

  test('TypeScript entries are .ts, .mts and .cts', () => {
    expect(['a.ts', 'a.mts', 'a.cts'].every(isTypeScriptEntry)).toBe(true)
    expect(['a.js', 'a.mjs', 'a.tsx', 'a.d.ts.map', 'bin/tooly'].some(isTypeScriptEntry)).toBe(
      false,
    )
  })

  test('the entry must be a file, under either runtime', () => {
    const co = seedCheckout(join(sb.root, 'co'))
    const spec = { ...SPEC, entry: 'src/main.ts' }
    expect(entryProblem(spec, co)).toBe('it has no entry src/main.ts')
    expect(entryProblem({ ...spec, runtime: 'node' }, co)).toBe('it has no entry src/main.ts')
    mkdirSync(join(co, 'src', 'main.ts'))
    expect(entryProblem(spec, co)).toBe('its entry src/main.ts is not a file')
  })

  test('bun, and a JavaScript entry under node, need no node', () => {
    const co = seedCheckout(join(sb.root, 'co'))
    writeFileSync(join(co, 'src', 'cli.js'), '')
    const missing = join(sb.root, 'no-such-node')
    expect(entryProblem(SPEC, co, { node: missing })).toBeNull()
    expect(entryProblem({ ...NSPEC, entry: 'src/cli.js' }, co, { node: missing })).toBeNull()
  })

  test('a TypeScript entry needs a node that strips types', () => {
    const co = seedCheckout(join(sb.root, 'co'))
    for (const ok of ['v22.18.0', 'v23.6.0', 'v24.1.0']) {
      expect(entryProblem(NSPEC, co, { node: nodeOf(ok) }), ok).toBeNull()
    }
    const old = nodeOf('v22.17.0')
    expect(entryProblem(NSPEC, co, { node: old })).toBe(
      `src/cli.ts is TypeScript, which node runs only from 22.18 on; ${old} is v22.17.0. ` +
        "Install Node 22.18 or later, or point the spec's entry at a built .js file.",
    )
    // 23.5 is newer than 22.18 but does not strip types, so the line says which 23 does.
    expect(entryProblem(NSPEC, co, { node: nodeOf('v23.5.0') })).toContain(
      'which node runs only from 22.18 on (in the 23 line, from 23.6); ',
    )
  })

  test('a node that does not answer --version is a problem, named', () => {
    const co = seedCheckout(join(sb.root, 'co'))
    for (const node of [
      join(sb.root, 'no-such-node'),
      script('failing/node', 'exit 3'),
      script('silent/node', 'exit 0'),
    ]) {
      expect(entryProblem(NSPEC, co, { node })).toBe(
        `src/cli.ts is TypeScript, which node runs only from 22.18 on, and ${node} --version did not answer. Check that it runs.`,
      )
    }
  })

  test('the running node answers for itself', () => {
    const co = seedCheckout(join(sb.root, 'co'))
    // Vitest runs under a Node new enough to strip types.
    expect(entryProblem(NSPEC, co, { node: process.execPath })).toBeNull()
    expect(entryProblem(NSPEC, co)).toBeNull()
  })

  test('a TypeScript entry under node_modules is refused, as node refuses to strip it', () => {
    const co = seedCheckout(join(sb.root, 'node_modules', 'co'))
    expect(entryProblem(NSPEC, co, { node: nodeOf('v24.0.0') })).toBe(
      `node does not strip types from a file under node_modules (${join(co, 'src', 'cli.ts')})`,
    )
    // A JavaScript entry runs from there, and so does anything under bun.
    writeFileSync(join(co, 'src', 'cli.js'), '')
    expect(entryProblem({ ...NSPEC, entry: 'src/cli.js' }, co)).toBeNull()
    expect(entryProblem(SPEC, co)).toBeNull()
  })

  const hasBun = spawnSync('bun', ['--version']).status === 0

  // Under bun the node is the one on PATH, so its version comes from a spawn.
  test.skipIf(!hasBun)('under bun, the node on the absolute PATH entries is asked', () => {
    const co = seedCheckout(join(sb.root, 'co'))
    const probe = join(sb.root, 'probe.ts')
    const entryUrl = new URL('../../src/devlink/entry.ts', import.meta.url).href
    writeFileSync(
      probe,
      `import { entryProblem } from ${JSON.stringify(entryUrl)}\n` +
        `const spec = ${JSON.stringify(NSPEC)}\n` +
        `console.log(String(entryProblem(spec, ${JSON.stringify(co)}, { env: { PATH: process.env.PROBE_PATH } })))\n`,
    )
    const ask = (path: string) =>
      spawnSync('bun', ['--no-env-file', `--config=${devNull}`, 'run', probe], {
        cwd: sb.root,
        encoding: 'utf-8',
        env: { ...process.env, PROBE_PATH: path },
      }).stdout.trim()
    const old = nodeOf('v22.17.0')
    expect(ask(`bin:${join(old, '..')}`)).toBe(
      `src/cli.ts is TypeScript, which node runs only from 22.18 on; ${old} is v22.17.0. ` +
        "Install Node 22.18 or later, or point the spec's entry at a built .js file.",
    )
    expect(ask(join(nodeOf('v22.18.0'), '..'))).toBe('null')
    expect(ask('bin:.')).toBe(
      'src/cli.ts is TypeScript, which node runs only from 22.18 on, and no node is on an absolute PATH entry. Install Node 22.18 or later.',
    )
  })
})

describe('dev link and dev use check the entry', () => {
  test('link refuses a checkout whose node is too old, and writes nothing', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const node = nodeOf('v22.17.0')
    for (const dryRun of [false, true]) {
      expect(() => link(NSPEC, { checkout: a }, opts({ node, dryRun }))).toThrow(DevlinkError)
    }
    expect(() => link(NSPEC, { checkout: a }, opts({ node }))).toThrow(
      `cannot run ${a}: src/cli.ts is TypeScript, which node runs only from 22.18 on`,
    )
    expect(readActive(NSPEC, { dirs: sb.dirs })).toBeNull()
    expect(readHistory(NSPEC, { dirs: sb.dirs })).toEqual([])
  })

  test('link accepts it once the node strips types', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const out = link(NSPEC, { checkout: a }, opts({ node: nodeOf('v22.18.0') }))
    expect(out.entry).toBe(join(a, 'src', 'cli.ts'))
    expect(readActive(NSPEC, { dirs: sb.dirs })).toBe(a)
  })

  test('link refuses a checkout without the entry, under bun too', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const spec = { ...SPEC, entry: 'src/main.ts' }
    expect(() => link(spec, { checkout: a }, opts())).toThrow(
      `cannot run ${a}: it has no entry src/main.ts`,
    )
    writeFileSync(join(a, 'src', 'main.ts'), '')
    expect(link(spec, { checkout: a }, opts()).checkout).toBe(a)
  })

  test('use #n and use <path> are checked the same way', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    link(NSPEC, { checkout: a }, opts({ node: nodeOf('v24.0.0') }))
    const old = { node: nodeOf('v23.5.0') }
    expect(() => use(NSPEC, { target: '#1' }, opts(old))).toThrow(/v23\.5\.0/)
    expect(() => use(NSPEC, { target: a }, opts(old))).toThrow(/v23\.5\.0/)
    expect(readHistory(NSPEC, { dirs: sb.dirs })).toHaveLength(1)
  })

  test('the dev CLI prints the refusal and exits 1', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const io: CliIo & { err: string } = {
      err: '',
      stdout: () => {},
      stderr(t: string) {
        io.err += t
      },
    }
    const node = nodeOf('v22.17.0')
    expect(runDevCli(NSPEC, ['link', a], { ...opts({ node }), io })).toBe(1)
    expect(io.err).toBe(
      `tooly dev: cannot run ${a}: src/cli.ts is TypeScript, which node runs only from 22.18 on; ${node} is v22.17.0. ` +
        "Install Node 22.18 or later, or point the spec's entry at a built .js file.\n",
    )
  })
})

describe('devlinkHook with a node spec', () => {
  function runHook(env: Record<string, string>) {
    const calls: string[][] = []
    const hook = devlinkHook(NSPEC, {
      script: join(sb.root, 'elsewhere', 'tooly.js'),
      execve: (_file, args) => calls.push(args),
    })
    const io = captureIo()
    const ctx: CliContext = { io, cwd: sb.root, env: { HOME: sb.home, TOOLY_QUIET: '1', ...env } }
    return { code: hook(['x'], ctx), calls, err: io.err }
  }

  test("a checkout missing its dependencies is told to run its package manager's install", () => {
    const co = seedCheckout(join(sb.root, 'co'))
    writeFileSync(join(co, 'package.json'), JSON.stringify({ dependencies: { a: '1' } }))
    const r = runHook({ TOOLY_HOME: co })
    expect(r.code).toBe(1)
    expect(r.calls).toEqual([])
    expect(r.err).toBe(
      `tooly: ${co} has no node_modules. Run its package manager's install there.\n`,
    )
    mkdirSync(join(co, 'node_modules'))
    expect(runHook({ TOOLY_HOME: co }).err).toBe(
      `tooly: ${co} is missing package 'a'. Run its package manager's install there.\n`,
    )
  })

  test('a complete checkout is handed to node', () => {
    const co = seedCheckout(join(sb.root, 'co'))
    const r = runHook({ TOOLY_HOME: co })
    expect(r.code).toBe(0)
    expect(r.calls).toHaveLength(1)
    expect(r.calls[0]?.slice(1)).toEqual([join(co, 'src', 'cli.ts'), 'x'])
  })
})

describe('the bash launcher with a node spec', () => {
  let fakeBin: string
  beforeEach(() => {
    fakeBin = join(sb.root, 'fakebin')
    mkdirSync(fakeBin, { recursive: true })
    for (const name of ['bun', 'node']) {
      const tag = name.toUpperCase()
      writeFileSync(
        join(fakeBin, name),
        `#!/bin/sh\necho "${tag} $* LAYER=\${TOOLY_LAUNCH_LAYER-unset}"\n`,
      )
      chmodSync(join(fakeBin, name), 0o755)
    }
  })

  function checkoutWithLauncher(dir: string, builtEntry?: string): string {
    seedCheckout(dir, NSPEC)
    const launcherOpts = builtEntry === undefined ? {} : { builtEntry }
    writeFileSync(join(dir, NSPEC.launcher), renderLauncher(NSPEC, launcherOpts))
    chmodSync(join(dir, NSPEC.launcher), 0o755)
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

  test('is valid bash, and a bun spec still renders bun', () => {
    const path = join(sb.root, 'launcher.sh')
    const text = renderLauncher(NSPEC, { builtEntry: 'bin/tooly.js' })
    writeFileSync(path, text)
    expect(spawnSync('bash', ['-n', path]).status).toBe(0)
    expect(text).not.toMatch(/find_abs bun|"\$bun"|bun install/)
    expect(renderLauncher(SPEC)).toContain('exec "$bun" --no-env-file --config=/dev/null run')
  })

  test('refuses a runtime it has no launcher lines for', () => {
    expect(() => renderLauncher({ ...SPEC, runtime: 'deno' as 'node' })).toThrow(
      /runtime must be 'bun' or 'node', got "deno"/,
    )
  })

  test('the local checkout runs its source under node', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    expect(run(join(a, NSPEC.launcher), sb.root).out).toBe(
      `NODE ${a}/src/cli.ts arg1 arg two LAYER=local`,
    )
  })

  test('env, cwd and link run the selected checkout under node, as resolve() picks it', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    const launcher = join(a, NSPEC.launcher)
    const want = (layer: string) => `NODE ${b}/src/cli.ts arg1 arg two LAYER=${layer}`
    expect(run(launcher, sb.root, { TOOLY_HOME: b }).out).toBe(want('env'))
    expect(run(launcher, join(b, 'src')).out).toBe(want('cwd'))
    writeActive(NSPEC, b, { dirs: sb.dirs })
    expect(run(launcher, sb.root).out).toBe(want('link'))
    expect(resolve(NSPEC, { dirs: sb.dirs, env: {}, cwd: sb.root, self: a })).toMatchObject({
      source: 'link',
      runtime: 'node',
    })
  })

  test('announces the hand-off as the bun launcher does', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    const r = run(join(a, NSPEC.launcher), sb.root, { TOOLY_HOME: b, TOOLY_QUIET: '0' })
    expect(r.err).toBe(`tooly: running ${b}/src/cli.ts (TOOLY_HOME)`)
  })

  test('no node on an absolute PATH entry: exit 1 with the fix, for a selected checkout and for local', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    // Only the utilities the launcher needs, so no real node is found.
    const util = join(sb.root, 'utilities')
    mkdirSync(util)
    for (const name of ['bash', 'dirname', 'readlink', 'uname', 'cat', 'id', 'awk']) {
      const found = spawnSync('bash', ['-c', `command -v ${name}`], { encoding: 'utf-8' })
      symlinkSync(found.stdout.trim(), join(util, name))
    }
    // A bun on PATH does not stand in for node.
    const bunOnly = join(sb.root, 'bunonly')
    mkdirSync(bunOnly)
    writeFileSync(join(bunOnly, 'bun'), '#!/bin/sh\necho BUN\n')
    chmodSync(join(bunOnly, 'bun'), 0o755)
    const path = `${bunOnly}:${util}`
    const selected = run(join(a, NSPEC.launcher), sb.root, { TOOLY_HOME: b, PATH: path })
    expect(selected.code).toBe(1)
    expect(selected.out).toBe('')
    expect(selected.err).toBe(
      `tooly: the selected checkout (${b}) runs from source under node and needs node on an absolute PATH entry.\n` +
        "      Install Node (https://nodejs.org), or run 'tooly dev off' to use the local install.",
    )
    const local = run(join(a, NSPEC.launcher), sb.root, { PATH: path })
    expect(local.code).toBe(1)
    expect(local.err).toBe(
      'tooly: the source entry needs node on an absolute PATH entry. Install Node (https://nodejs.org).',
    )
  })

  test("a checkout missing a dependency is told to run its package manager's install", () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    writeFileSync(join(b, 'package.json'), '{"dependencies":{"left":"1"}}\n')
    const none = run(join(a, NSPEC.launcher), join(b, 'src'))
    expect(none.code).toBe(1)
    expect(none.err).toBe(
      `tooly: ${b} has no node_modules. Run its package manager's install there.`,
    )
    mkdirSync(join(b, 'node_modules'))
    expect(run(join(a, NSPEC.launcher), join(b, 'src')).err).toBe(
      `tooly: ${b} is missing package 'left'. Run its package manager's install there.`,
    )
    mkdirSync(join(b, 'node_modules', 'left'))
    expect(run(join(a, NSPEC.launcher), join(b, 'src')).out).toBe(
      `NODE ${b}/src/cli.ts arg1 arg two LAYER=cwd`,
    )
  })

  test('with a built entry: an install runs it, a dev checkout (node_modules) runs the source', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'), 'bin/tooly.js')
    writeFileSync(join(a, 'bin', 'tooly.js'), '')
    expect(run(join(a, NSPEC.launcher), sb.root).out).toBe(
      `NODE ${a}/bin/tooly.js arg1 arg two LAYER=local`,
    )
    mkdirSync(join(a, 'node_modules'))
    expect(run(join(a, NSPEC.launcher), sb.root).out).toBe(
      `NODE ${a}/src/cli.ts arg1 arg two LAYER=local`,
    )
  })

  test('a real node runs a real TypeScript checkout through the launcher', () => {
    const a = checkoutWithLauncher(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    const report = join(sb.root, 'report')
    writeFileSync(join(b, 'src', 'lib.ts'), 'export const n: number = 42\n')
    writeFileSync(
      join(b, 'src', 'cli.ts'),
      "import { writeFileSync } from 'node:fs'\nimport { n } from './lib.ts'\n" +
        `writeFileSync(${JSON.stringify(report)}, String(n) + ' ' + process.argv.slice(2).join(','))\n`,
    )
    const nodeDir = join(process.execPath, '..')
    const r = run(join(a, NSPEC.launcher), sb.root, {
      TOOLY_HOME: b,
      PATH: `${nodeDir}:/usr/bin:/bin`,
    })
    expect(r.err).toBe('')
    expect(r.code).toBe(0)
    expect(existsSync(report)).toBe(true)
    expect(readFileSync(report, 'utf-8')).toBe('42 arg1,arg two')
  })
})
