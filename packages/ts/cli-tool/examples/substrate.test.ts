/**
 * The root entry used the way a consumer uses it: through the package name
 * only. Every export of `@osdlc/cli-tool` appears here at least once;
 * `tests/exports.test.ts` checks that.
 */

import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import {
  askYesNo,
  canPrompt,
  captureContext,
  captureIo,
  closestMatches,
  defineCli,
  DOMAIN_EXIT_MAX,
  DOMAIN_EXIT_MIN,
  didYouMean,
  envVars,
  EXIT,
  isDomainExit,
  isYes,
  processContext,
  processIo,
  readLine,
  runMain,
  systemDirs,
  TieredDirs,
  type AskYesNoOptions,
  type BooleanFlag,
  type Cli,
  type CliContext,
  type CliDecl,
  type CliIo,
  type CountFlag,
  type EnumFlag,
  type EnvVars,
  type ExitCode,
  type FlagDecl,
  type FlagSpec,
  type FlagValues,
  type ListFlag,
  type MainFn,
  type ParseResult,
  type PositionalDecl,
  type RunMainOptions,
  type StringFlag,
  type ResolveOptions,
  type TristateFlag,
  type VendorDirs,
} from '@osdlc/cli-tool'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cli-tool-example-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

// The flags of a small tool, each kind once. Declared once, they drive both
// the parser and the help text.
const verbose: CountFlag = { kind: 'count', short: 'v', help: 'say more' }
const all: BooleanFlag = { kind: 'boolean', help: 'every repository' }
const output: EnumFlag<'text' | 'json'> = {
  kind: 'enum',
  choices: ['text', 'json'],
  default: 'text',
  help: 'report format',
}
const name: StringFlag = { kind: 'string', valueName: 'name', help: 'a name' }
const scope: ListFlag = { kind: 'list', valueName: 'list', default: [], help: 'what to sweep' }
const color: TristateFlag = { kind: 'tristate', help: 'force color', offHelp: 'no color' }
const path: PositionalDecl = { name: 'path', variadic: true, help: 'a checkout' }

const flags = { verbose, all, output, name, scope, color } satisfies FlagSpec
const decl: CliDecl<typeof flags> = {
  name: 'tooly',
  summary: 'Say what can go away.',
  flags,
  positionals: [path],
}
const cli: Cli<typeof flags> = defineCli(decl)
const anyFlag: FlagDecl = verbose

test('flags are declared once and parsed to typed values', () => {
  const io: CliIo = captureIo()
  const result: ParseResult<typeof flags> = cli.parse(
    ['-vv', '--all', '--output=json', '--scope', 'a,b', '/repo'],
    io,
  )
  expect(result.status).toBe('ok')
  if (result.status !== 'ok') return
  const values: FlagValues<typeof flags> = result.values
  expect(values).toMatchObject({ verbose: 2, all: true, output: 'json', scope: ['a', 'b'] })
  expect(values.color).toBeUndefined()
  expect(result.positionals).toEqual(['/repo'])
  expect(anyFlag.kind).toBe('count')
})

test('a usage error comes back as a value, with nothing written to a stream', () => {
  const io = captureIo()
  const result = cli.parse(['--output', 'xml'], io)
  expect(result.status).toBe('error')
  expect(io.out + io.err).toBe('')
  expect(cli.help()).toContain('--output <value>')
})

test('exit codes: the universal three and the tool-owned band', () => {
  const code: ExitCode = EXIT.usage
  expect(code).toBe(2)
  expect([EXIT.ok, EXIT.error]).toEqual([0, 1])
  expect(isDomainExit(DOMAIN_EXIT_MIN)).toBe(true)
  expect(isDomainExit(DOMAIN_EXIT_MAX)).toBe(true)
  expect(isDomainExit(EXIT.usage)).toBe(false)
})

test('a main function is driven against a captured context', async () => {
  const main: MainFn = (argv, ctx: CliContext) => {
    ctx.io.stdout(`hello ${argv.join(' ')} from ${ctx.cwd}\n`)
    return EXIT.ok
  }
  const ctx = captureContext({ cwd: '/work', env: { TOOLY: '1' } })
  expect(await main(['a', 'b'], ctx)).toBe(0)
  expect(ctx.io.out).toBe('hello a b from /work\n')
  expect(processContext().cwd).toBe(process.cwd())
})

test('runMain turns a thrown error into one line on stderr and exit 1', async () => {
  const context = captureContext()
  const options: RunMainOptions = { name: 'tooly', context, argv: [] }
  const before = process.exitCode
  try {
    await runMain(() => {
      throw new Error('boom')
    }, options)
    expect(context.io.err).toBe('tooly: boom\n')
    expect(process.exitCode).toBe(EXIT.error)
  } finally {
    // Bun 1.4.2 treats an undefined reset as unset and exits 1, so restore 0 instead.
    process.exitCode = before ?? 0
  }
})

test('processIo is the real streams; captureIo is the test double', () => {
  const real: CliIo = processIo
  expect(typeof real.stdout).toBe('function')
  const fake = captureIo()
  fake.stderr('x')
  expect(fake.err).toBe('x')
})

test('asking yes or no reads one line and falls back to the default', () => {
  const file = join(dir, 'in')
  writeFileSync(file, 'yes\n')
  const fd = openSync(file, 'r')
  const written: string[] = []
  const options: AskYesNoOptions = { defaultYes: false, write: (t) => written.push(t), fd }
  try {
    expect(askYesNo('Delete it?', options)).toBe(true)
  } finally {
    closeSync(fd)
  }
  expect(written).toEqual(['Delete it? [y/N] '])
  expect(isYes(' Y ')).toBe(true)
  expect(isYes('nope')).toBe(false)
  writeFileSync(file, 'first\nsecond\n')
  const again = openSync(file, 'r')
  try {
    expect(readLine(again)).toBe('first')
  } finally {
    closeSync(again)
  }
  expect(typeof canPrompt()).toBe('boolean')
})

test('re-exported helpers: close matches and per-OS directories', () => {
  expect(closestMatches('lst', ['list', 'link', 'status'])).toContain('list')
  expect(didYouMean('lsit', ['list', 'status'])).toContain('list')

  const vars: EnvVars = envVars('TOOLY')
  const vendorDirs: VendorDirs = { vendor: 'com.example', envVars: vars }
  const options: ResolveOptions = { home: dir, env: {} }
  const dirs: TieredDirs = systemDirs(vendorDirs, options)
  expect(dirs.standalone('tooly').config().path).toContain('tooly')
})
