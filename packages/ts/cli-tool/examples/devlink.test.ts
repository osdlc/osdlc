/**
 * The devlink entry used the way a consumer uses it: through the package
 * name only. Every export of `@osdlc/cli-tool/devlink` appears here at least
 * once. `tests/exports.test.ts` checks that.
 */

import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { captureContext, envVars, runMain, systemDirs, type DevlinkHook } from '@osdlc/cli-tool'
import {
  appendHistory,
  clearActive,
  cwdCheckout,
  cwdDevVar,
  defaultBinDir,
  DevlinkError,
  devlinkHook,
  entryOf,
  envStem,
  execSelection,
  findOnPath,
  gitHead,
  history,
  HISTORY_FILE,
  historyPath,
  HOME_FILE,
  homePath,
  homeVar,
  install,
  isCheckout,
  isOnPath,
  launchLayerVar,
  launcherCheckout,
  launcherDrift,
  link,
  off,
  pathNames,
  quietVar,
  readActive,
  readHistory,
  readShimTarget,
  renderLauncher,
  renderShim,
  resolve,
  runDevCli,
  samePath,
  stateDir,
  status,
  suppressed,
  usage,
  use,
  validateSpec,
  writeActive,
  processIo,
  type CliIo,
  type DevlinkHookOptions,
  type ExecOptions,
  type GitHead,
  type HistoryEntry,
  type HistoryEvent,
  type HistoryKind,
  type InstallInput,
  type InstallResult,
  type InstalledLink,
  type LauncherOptions,
  type LinkInput,
  type LinkResult,
  type LinkStatus,
  type Local,
  type OffResult,
  type OpOptions,
  type ResolveOptions,
  type RunOptions,
  type Selected,
  type Selection,
  type ShimStatus,
  type Source,
  type StateOptions,
  type StatusResult,
  type ToolSpec,
  type UseInput,
  type UseResult,
} from '@osdlc/cli-tool/devlink'

const SPEC: ToolSpec = validateSpec({
  name: 'tooly',
  marker: 'src/cli.ts',
  launcher: 'bin/tooly',
  aliases: ['ty'],
  suppressors: ['TOOLY_HOST'],
  cwdLayer: true,
  vendorDirs: { vendor: 'com.example', envVars: envVars('TOOLY') },
})

let root: string
let state: StateOptions
let opts: OpOptions
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'devlink-example-')))
  // Rooted directories, so state lands under the temp dir, not the real home.
  state = { dirs: systemDirs(SPEC.vendorDirs, { home: join(root, 'home'), env: {} }) }
  opts = { ...state, env: {}, cwd: root }
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

/** A directory that carries the marker and a launcher. */
function checkout(name: string, branch = 'main'): string {
  const dir = join(root, name)
  mkdirSync(join(dir, 'src'), { recursive: true })
  mkdirSync(join(dir, 'bin'), { recursive: true })
  writeFileSync(join(dir, SPEC.marker), '// entry\n')
  writeFileSync(join(dir, SPEC.launcher), '#!/bin/sh\n', { mode: 0o755 })
  mkdirSync(join(dir, '.git', 'refs', 'heads'), { recursive: true })
  writeFileSync(join(dir, '.git', 'HEAD'), `ref: refs/heads/${branch}\n`)
  writeFileSync(join(dir, '.git', 'refs', 'heads', branch), `${'a'.repeat(40)}\n`)
  return dir
}

test('the spec names every variable and path the tool uses', () => {
  expect(envStem(SPEC)).toBe('TOOLY')
  expect(homeVar(SPEC)).toBe('TOOLY_HOME')
  expect(cwdDevVar(SPEC)).toBe('TOOLY_CWD_DEV')
  expect(quietVar(SPEC)).toBe('TOOLY_QUIET')
  expect(launchLayerVar(SPEC)).toBe('TOOLY_LAUNCH_LAYER')
  expect(entryOf(SPEC)).toBe('src/cli.ts')
  expect(pathNames(SPEC)).toEqual(['tooly', 'ty'])
  expect(() => validateSpec({ ...SPEC, name: 'a/b' })).toThrow()
})

test('link a checkout, see it in status and history, then go back', () => {
  const a = checkout('a')
  const b = checkout('b', 'feature')
  expect(isCheckout(SPEC, a)).toBe(true)
  expect(cwdCheckout(SPEC, join(a, 'src'))).toBe(a)
  expect(samePath(a, join(a, 'src', '..'))).toBe(true)
  expect(gitHead(b)).toEqual({ branch: 'feature', head: 'a'.repeat(12) } satisfies GitHead)

  const input: LinkInput = { checkout: a, label: 'first' }
  const linked: LinkResult = link(SPEC, input, opts)
  expect(linked.checkout).toBe(a)
  const next = use(SPEC, { target: b } satisfies UseInput, opts)
  expect(next.kind).toBe('checkout')

  const selection: Selection = resolve(SPEC, opts)
  const source: Source = selection.source
  expect(source).toBe('link')
  const selected = selection as Selected
  expect(selected.checkout).toBe(b)

  const rows: HistoryEntry[] = history(SPEC, opts)
  expect(rows.map((r) => r.checkout)).toEqual([b, a])
  const back: UseResult = use(SPEC, { target: '#2' }, opts)
  expect(back.kind).toBe('checkout')

  const report: StatusResult = status(SPEC, opts)
  expect(report.link.value).toBe(a)

  const cleared: OffResult = off(SPEC, opts)
  expect(cleared.previous).toBe(a)
  const local: Local = resolve(SPEC, opts) as Local
  expect(local.source).toBe('local')
})

test('an environment variable always wins; a suppressor turns the others off', () => {
  const a = checkout('a')
  const forced: ResolveOptions = { ...opts, env: { TOOLY_HOME: a } }
  expect(resolve(SPEC, forced).source).toBe('env')
  expect(suppressed(SPEC, { TOOLY_HOST: '1' })).toBe(true)
  expect(resolve(SPEC, { ...opts, cwd: a, env: { TOOLY_HOST: '1' } }).source).toBe('local')
})

test('the state files: the active link and an append-only history', () => {
  const a = checkout('a')
  expect(stateDir(SPEC, state)).toContain('tooly')
  expect(homePath(SPEC, state).endsWith(HOME_FILE)).toBe(true)
  expect(historyPath(SPEC, state).endsWith(HISTORY_FILE)).toBe(true)
  expect(readActive(SPEC, state)).toBeNull()
  writeActive(SPEC, a, state)
  expect(readActive(SPEC, state)).toBe(a)
  const kind: HistoryKind = 'link'
  const event: HistoryEvent = { at: '2026-01-01T00:00:00.000Z', event: kind, checkout: a }
  appendHistory(SPEC, event, state)
  expect(readHistory(SPEC, state)).toEqual([event])
  expect(clearActive(SPEC, state)).toBe(true)
})

test('install puts a shim on PATH for the name and each alias', () => {
  const a = checkout('a')
  const binDir = join(root, 'bin')
  const input: InstallInput = { checkout: a, binDir }
  const result: InstallResult = install(SPEC, input, opts)
  const links: InstalledLink[] = result.links
  const created: LinkStatus = links[0]!.status
  expect(created).toBe('created')
  expect(links.map((l) => l.name)).toEqual(['tooly', 'ty'])
  expect(readShimTarget(join(binDir, 'tooly'))).toBe(result.target)
  expect(readFileSync(join(binDir, 'ty'), 'utf8')).toBe(renderShim(SPEC, result.target))
  expect(isOnPath(binDir, { PATH: binDir })).toBe(true)
  expect(findOnPath('tooly', { PATH: binDir })).toBe(join(binDir, 'tooly'))
  expect(defaultBinDir({ HOME: '/home/me' })).toBe('/home/me/.local/bin')

  const shim: ShimStatus | null = status(SPEC, { ...opts, env: { PATH: binDir } }).shim
  expect(shim?.targetExists).toBe(true)
  expect(() => install(SPEC, { checkout: join(root, 'missing') }, opts)).toThrow(DevlinkError)
})

test('the bash launcher is rendered from the spec and checked for drift', () => {
  const a = checkout('a')
  const options: LauncherOptions = { builtEntry: 'dist/cli.js' }
  writeFileSync(join(a, SPEC.launcher), renderLauncher(SPEC, options))
  chmodSync(join(a, SPEC.launcher), 0o755)
  expect(launcherDrift(SPEC, a, options)).toBeNull()
  expect(launcherDrift(SPEC, a)).not.toBeNull()
  expect(launcherCheckout(SPEC, join(a, SPEC.launcher))).toBe(a)
})

// The shim runs `bun run <marker>`, so this one needs a real bun on PATH.
const hasBun = spawnSync('bun', ['--version']).status === 0

test.skipIf(!hasBun)(
  'a JavaScript shim hands off to the selected checkout, or runs its own code',
  () => {
    const a = checkout('a')
    writeFileSync(join(a, SPEC.marker), 'process.exit(7)\n')
    const lines: string[] = []
    const exec: ExecOptions = {
      env: { ...process.env },
      announce: (l) => lines.push(l),
      bun: 'bun',
    }
    expect(execSelection(SPEC, resolve(SPEC, opts), [], exec)).toBeNull()
    const selection = resolve(SPEC, { ...opts, env: { TOOLY_HOME: a } })
    expect(execSelection(SPEC, selection, [], exec)).toBe(7)
    expect(lines[0]).toContain('running')
  },
)

test('the dev verbs mounted for a tool with no CLI framework', () => {
  const a = checkout('a')
  let out = ''
  const io: CliIo = { stdout: (t) => (out += t), stderr: (t) => (out += t) }
  const run: RunOptions = { ...opts, io }
  expect(runDevCli(SPEC, ['link', a], run)).toBe(0)
  expect(runDevCli(SPEC, ['history'], run)).toBe(0)
  expect(out).toContain(a)
  expect(runDevCli(SPEC, [], run)).toBe(2)
  expect(usage(SPEC)).toContain('usage: tooly dev')
  expect(typeof processIo.stdout).toBe('function')
})

test('runMain with devlinkHook: dev is answered, and with no link main runs', async () => {
  const self = checkout('self')
  const hookOptions: DevlinkHookOptions = { script: join(self, SPEC.launcher) }
  const hook: DevlinkHook = devlinkHook(SPEC, hookOptions)
  const env = { HOME: join(root, 'home') }
  let ran = false
  const main = () => {
    ran = true
    return 0
  }
  const before = process.exitCode
  try {
    const dev = captureContext({ cwd: root, env })
    await runMain(main, { name: 'tooly', context: dev, argv: ['dev', 'nope'], devlink: hook })
    expect(process.exitCode).toBe(2)
    expect(ran).toBe(false)

    const plain = captureContext({ cwd: root, env })
    await runMain(main, { name: 'tooly', context: plain, argv: ['list'], devlink: hook })
    expect(ran).toBe(true)
  } finally {
    process.exitCode = before ?? 0
  }
})
