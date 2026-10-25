import { describe, expect, test } from 'vitest'
import { z } from 'zod'

import {
  CommandError,
  UsageError,
  commandKit,
  defineApp,
  defineCommand,
  defineGroup,
  outcome,
} from '../../src/command/index.ts'
import { captureContext } from '../../src/io.ts'
import { runApp } from '../../src/testing.ts'

const GLOBALS = {
  dir: { kind: 'string', short: 'C', valueName: 'path', help: 'the directory to work in' },
} as const

const kit = commandKit({ globals: GLOBALS })

const seen: { dir?: string | undefined; rest?: string[] } = {}

const get = kit.command({
  summary: 'one value',
  positionals: [{ name: 'key', required: true, help: 'the key' }],
  output: z.object({ key: z.string(), value: z.number() }),
  examples: ['config get size'],
  run({ positionals, globals, rest }) {
    seen.dir = globals.dir
    seen.rest = rest
    return { key: positionals[0]!, value: 42 }
  },
  text: (o) => `${o.key}=${o.value}\n`,
})

const list = kit.command({
  summary: 'every value',
  description: 'Lists every value this tool knows about, in the order they were set, one per line.',
  flags: { long: { kind: 'boolean', help: 'more detail', hidden: true } },
  output: z.object({ values: z.array(z.string()) }),
  kind: 'config-list',
  run: () => ({ values: ['a', 'b'] }),
})

const tui = kit.command({
  summary: 'the terminal UI',
  interactive: true,
  positionals: [{ name: 'dir' }],
  run(input, ctx) {
    ctx.io.stdout(`ui ${input.positionals[0] ?? '.'}\n`)
    return 0
  },
})

const fails = kit.command({
  summary: 'always fails',
  flags: { usage: { kind: 'boolean', help: 'fail as a usage error' } },
  exits: { 12: 'nothing to do' },
  output: z.object({}),
  run({ flags }) {
    if (flags.usage) throw new UsageError('bad combination')
    throw new CommandError('it broke', { exit: 12, hint: 'try again' })
  },
})

const empty = kit.command({
  summary: 'finds nothing',
  output: z.object({ hits: z.array(z.string()) }),
  run: () => outcome({ hits: [] }, 1),
})

const app = defineApp({
  name: 'tooly',
  version: '1.2.3',
  summary: 'a test tool',
  globals: GLOBALS,
  default: tui,
  commands: {
    config: kit.group({ summary: 'settings', default: list, commands: { list, get } }),
    nested: kit.group({
      summary: 'no default',
      commands: { deep: kit.group({ summary: 'deeper', commands: { get } }) },
    }),
    fails,
    empty,
  },
})

describe('routing and output', () => {
  test('a data command prints text by default', async () => {
    const r = await runApp(app, ['config', 'get', 'size'])
    expect(r).toMatchObject({ exit: 0, out: 'size=42\n', err: '' })
  })

  test('--json prints one document with schemaVersion and kind first', async () => {
    const r = await runApp(app, ['config', 'get', 'size', '--json'])
    expect(r.exit).toBe(0)
    expect(Object.keys(r.json())).toEqual(['schemaVersion', 'kind', 'key', 'value'])
    expect(r.json()).toEqual({ schemaVersion: 1, kind: 'config-get', key: 'size', value: 42 })
  })

  test("a command's own fields cannot replace schemaVersion or kind", async () => {
    const sneaky = defineApp({
      name: 't',
      version: '0',
      summary: 's',
      commands: {
        x: defineCommand({
          summary: 'x',
          output: z.object({ n: z.number() }),
          kind: 'real',
          run: () => ({ n: 1, kind: 'other', schemaVersion: 99 }) as never,
        }),
      },
    })
    const r = await runApp(sneaky, ['x', '--json'])
    expect(r.json()).toEqual({ schemaVersion: 1, kind: 'real', n: 1 })
    expect(Object.keys(r.json()).slice(0, 2)).toEqual(['schemaVersion', 'kind'])
    const called = await sneaky.call(['x'], {}, { cwd: '/', env: {} }, { surface: 'mcp' })
    expect(called).toMatchObject({ document: { schemaVersion: 1, kind: 'real' } })
  })

  test('a declared kind wins, and a group runs its default', async () => {
    const r = await runApp(app, ['config', '--json'])
    expect(r.json()).toMatchObject({ kind: 'config-list', values: ['a', 'b'] })
  })

  test('a command with no text renderer prints its output as JSON without the envelope', async () => {
    const r = await runApp(app, ['config', 'list'])
    expect(JSON.parse(r.out)).toEqual({ values: ['a', 'b'] })
  })

  test('global flags work before and after the command word', async () => {
    await runApp(app, ['-C', '/x', 'config', 'get', 'k'])
    expect(seen.dir).toBe('/x')
    await runApp(app, ['config', 'get', 'k', '--dir', '/y'])
    expect(seen.dir).toBe('/y')
  })

  test('words after -- are passed through', async () => {
    await runApp(app, ['config', 'get', 'k', '--', '--not-a-flag', 'x'])
    expect(seen.rest).toEqual(['--not-a-flag', 'x'])
  })

  test('a missing required positional takes a dash-leading word after --', async () => {
    const r = await runApp(app, ['config', 'get', '--', '-5'])
    expect(r).toMatchObject({ exit: 0, out: '-5=42\n' })
    expect(seen.rest).toEqual([])
    await runApp(app, ['config', 'get', '--', '-5', '--more'])
    expect(seen.rest).toEqual(['--more'])
  })

  test('the value of a flag is not read as --help or --json', async () => {
    const echo = defineApp({
      name: 't',
      version: '0',
      summary: 's',
      commands: {
        echo: defineCommand({
          summary: 'echo',
          flags: { name: { kind: 'string', help: 'a name' } },
          output: z.object({ name: z.string().nullable() }),
          run: ({ flags }) => ({ name: flags.name ?? null }),
          text: (o) => `${o.name}\n`,
        }),
      },
    })
    expect(await runApp(echo, ['echo', '--name', '--help'])).toMatchObject({
      exit: 0,
      out: '--help\n',
    })
    expect(await runApp(echo, ['echo', '--name', '--json'])).toMatchObject({
      exit: 0,
      out: '--json\n',
    })
  })

  test('an unknown command with --help is still a usage error', async () => {
    const r = await runApp(app, ['nested', 'nosuch', '--help'])
    expect(r.exit).toBe(2)
    expect(r.err).toContain("unknown command 'nested nosuch'")
    const under = await runApp(app, ['config', 'nosuch'])
    expect(under.exit).toBe(2)
    expect(under.err).toContain("unknown command 'config nosuch'")
  })

  test('the root default takes a word that names no command', async () => {
    const r = await runApp(app, ['somedir'])
    expect(r).toMatchObject({ exit: 0, out: 'ui somedir\n' })
  })

  test('an interactive command refuses --json with exit 2', async () => {
    const r = await runApp(app, ['--json'])
    expect(r.exit).toBe(2)
    expect(r.json()).toMatchObject({ kind: 'error', code: 'usage', exit: 2 })
    expect(r.err).toContain('is interactive and has no JSON form')
  })

  test('an outcome prints its output and ends with its exit code', async () => {
    const r = await runApp(app, ['empty', '--json'])
    expect(r.exit).toBe(1)
    expect(r.json()).toMatchObject({ kind: 'empty', hits: [] })
  })
})

describe('errors', () => {
  test('a parse error is exit 2 with the usage line on stderr', async () => {
    const r = await runApp(app, ['config', 'get', 'a', '--bogus'])
    expect(r.exit).toBe(2)
    expect(r.out).toBe('')
    expect(r.err).toMatch(
      /^tooly: unknown option '--bogus'\nusage: tooly config get \[options\] <key>\nSee "tooly help config get"\.\n$/,
    )
  })

  test('a missing required positional is exit 2', async () => {
    expect((await runApp(app, ['config', 'get'])).exit).toBe(2)
  })

  test('an unknown command under a group with no default suggests a close name', async () => {
    const r = await runApp(app, ['nested', 'deap'])
    expect(r.exit).toBe(2)
    expect(r.err).toContain("unknown command 'nested deap'; did you mean deep?")
  })

  test('the value of a global flag is not read as a command word', async () => {
    const r = await runApp(app, ['nested', '-C', 'dir'])
    expect(r.exit).toBe(2)
    expect(r.err).not.toContain('unknown command')
  })

  test('a group with no default and no word prints its help on stderr, exit 2', async () => {
    const r = await runApp(app, ['nested'])
    expect(r.exit).toBe(2)
    expect(r.out).toBe('')
    expect(r.err).toContain('commands:\n  deep')
    expect(r.err.startsWith("tooly: 'tooly nested' needs a command\n")).toBe(true)
  })

  test('a group with no default under --json prints a usage error document', async () => {
    const r = await runApp(app, ['nested', '--json'])
    expect(r.exit).toBe(2)
    expect(r.json()).toMatchObject({ kind: 'error', code: 'usage', exit: 2 })
    expect(r.err).toContain("tooly: 'tooly nested' needs a command")
  })

  test('a CommandError prints its message and hint and exits with its code', async () => {
    const r = await runApp(app, ['fails'])
    expect(r).toMatchObject({ exit: 12, out: '', err: 'tooly: it broke\ntry again\n' })
  })

  test('a UsageError from run is exit 2', async () => {
    const r = await runApp(app, ['fails', '--usage', '--json'])
    expect(r.exit).toBe(2)
    expect(r.json()).toMatchObject({ kind: 'error', code: 'usage', message: 'bad combination' })
  })

  test('under --json or jsonl an error is also a document on stdout', async () => {
    const text = await runApp(app, ['fails'])
    expect(text.out).toBe('')
    const json = await runApp(app, ['fails', '--json'])
    expect(json).toMatchObject({ exit: 12, err: 'tooly: it broke\ntry again\n' })
    expect(json.json()).toEqual({
      schemaVersion: 1,
      kind: 'error',
      code: 'error',
      message: 'it broke',
      exit: 12,
      hint: 'try again',
    })
    const jsonl = await runApp(app, ['config', 'get', '--output', 'jsonl'])
    expect(jsonl.exit).toBe(2)
    expect(jsonl.out.trimEnd().split('\n')).toHaveLength(1)
    expect(JSON.parse(jsonl.out)).toMatchObject({ kind: 'error', code: 'usage' })
    const unknown = await runApp(app, ['nosuch', '--json'])
    expect(JSON.parse(unknown.out)).toMatchObject({ kind: 'error', code: 'usage' })
  })

  test('a thrown failure exits with its category code', async () => {
    const broken = defineApp({
      name: 't',
      version: '0',
      summary: 's',
      commands: {
        x: defineCommand({
          summary: 'x',
          output: z.object({}),
          run() {
            throw { kind: 'not-installed', message: 'git is not installed' }
          },
        }),
      },
    })
    const r = await runApp(broken, ['x'])
    expect(r.exit).toBe(22)
    expect(r.err).toContain('t: git is not installed')
    const json = await runApp(broken, ['x', '--json'])
    expect(json.json()).toEqual({
      schemaVersion: 1,
      kind: 'error',
      code: 'not-installed',
      message: 'git is not installed',
      exit: 22,
    })
  })

  test('any other thrown error is a safe line and, under --json, an error document', async () => {
    const broken = defineApp({
      name: 't',
      version: '0',
      summary: 's',
      commands: {
        x: defineCommand({
          summary: 'x',
          output: z.object({}),
          run() {
            throw new Error('bug')
          },
        }),
      },
    })
    expect(await runApp(broken, ['x'])).toMatchObject({ exit: 1, out: '', err: 't: bug\n' })
    const json = await runApp(broken, ['x', '--json'])
    expect(json.json()).toMatchObject({ kind: 'error', code: 'error', message: 'bug', exit: 1 })
  })

  test('--all without --help is a usage error', async () => {
    expect((await runApp(app, ['config', 'list', '--all'])).exit).toBe(2)
  })

  test('checkOutput fails a run whose output does not match', async () => {
    const lying = defineApp({
      name: 't',
      version: '0',
      summary: 's',
      checkOutput: true,
      commands: {
        x: defineCommand({
          summary: 'x',
          output: z.object({ n: z.number() }),
          run: () => ({ n: 'one' as unknown as number }),
        }),
      },
    })
    const ctx = captureContext()
    expect(await lying.run(['x'], ctx)).toBe(1)
    expect(ctx.io.out).toBe('')
    expect(ctx.io.err).toContain('does not match its schema')
  })

  test('runApp checks a --json answer against the document schema', async () => {
    const lying = defineApp({
      name: 't',
      version: '0',
      summary: 's',
      commands: {
        x: defineCommand({
          summary: 'x',
          output: z.object({ n: z.number() }),
          run: () => ({ n: 'one' as unknown as number }),
        }),
      },
    })
    await expect(runApp(lying, ['x', '--json'])).rejects.toThrow('does not match its schema')
  })
})

describe('--version', () => {
  test('prints name and version', async () => {
    expect((await runApp(app, ['--version'])).out).toBe('tooly 1.2.3\n')
  })

  test('as JSON', async () => {
    const r = await runApp(app, ['--version', '--json'])
    expect(r.json()).toEqual({ schemaVersion: 1, kind: 'version', name: 'tooly', version: '1.2.3' })
  })

  test('is a root flag only', async () => {
    expect((await runApp(app, ['config', 'list', '--version'])).exit).toBe(2)
  })
})

describe('declaration checks', () => {
  test('output may not declare schemaVersion or kind', () => {
    expect(() =>
      defineCommand({
        summary: 'x',
        output: z.object({ kind: z.string() }),
        run: () => ({ kind: 'k' }),
      }),
    ).toThrow("may not declare 'kind'")
  })

  test('a command may not declare a builtin flag', () => {
    expect(() =>
      defineCommand({
        summary: 'x',
        flags: { json: { kind: 'boolean', help: 'h' } },
        output: z.object({}),
        run: () => ({}),
      }),
    ).toThrow("flag 'json' is provided by the app")
  })

  test('exit codes must be 1 or in 10-63', () => {
    expect(() =>
      defineCommand({ summary: 'x', exits: { 2: 'no' }, output: z.object({}), run: () => ({}) }),
    ).toThrow('exit code 2')
  })

  test('a command needs an output or interactive: true', () => {
    expect(() => defineCommand({ summary: 'x', run: () => ({}) } as never)).toThrow(
      'declares its output',
    )
  })

  test('summaries may not be empty', () => {
    expect(() => defineCommand({ summary: ' ', output: z.object({}), run: () => ({}) })).toThrow(
      'summary is empty',
    )
    expect(() => defineGroup({ summary: '' })).toThrow('summary is empty')
  })

  test('a command flag may not shadow a global', () => {
    expect(() =>
      defineApp({
        name: 't',
        version: '0',
        summary: 's',
        globals: GLOBALS,
        commands: {
          x: defineCommand({
            summary: 'x',
            flags: { dir: { kind: 'string', help: 'h' } },
            output: z.object({}),
            run: () => ({}),
          }),
        },
      }),
    ).toThrow("declares 'dir', which is a global flag")
  })

  test('a flag may not take -h, or a short a global takes', () => {
    expect(() =>
      defineCommand({
        summary: 'x',
        flags: { host: { kind: 'string', short: 'h', help: 'h' } },
        output: z.object({}),
        run: () => ({}),
      }),
    ).toThrow("'host' takes -h")
    expect(() =>
      defineApp({
        name: 't',
        version: '0',
        summary: 's',
        globals: { verbose: { kind: 'boolean', short: 'h', help: 'h' } },
        commands: {},
      }),
    ).toThrow("'verbose' takes -h")
    expect(() =>
      defineApp({
        name: 't',
        version: '0',
        summary: 's',
        globals: GLOBALS,
        commands: {
          x: defineCommand({
            summary: 'x',
            flags: { color: { kind: 'boolean', short: 'C', help: 'h' } },
            output: z.object({}),
            run: () => ({}),
          }),
        },
      }),
    ).toThrow('declares -C, which a global flag takes')
  })

  test('a command may not give a meaning to the shared failure codes 22-25', () => {
    for (const code of [22, 25]) {
      expect(() =>
        defineCommand({
          summary: 'x',
          exits: { [code]: 'mine' },
          output: z.object({}),
          run: () => ({}),
        }),
      ).toThrow(`exit code ${code} is one of the shared failure codes`)
    }
  })

  test('a flag named after an Object.prototype member is not taken for a builtin', () => {
    const c = defineCommand({
      summary: 'x',
      flags: { constructor: { kind: 'string', help: 'h' } } as const,
      output: z.object({}),
      run: () => ({}),
    })
    expect(() =>
      defineApp({ name: 't', version: '0', summary: 's', globals: GLOBALS, commands: { c } }),
    ).not.toThrow()
  })

  test('an items element may not declare schemaVersion or kind', () => {
    expect(() =>
      defineCommand({
        summary: 'x',
        output: z.object({ records: z.array(z.object({ kind: z.string() })) }),
        items: { field: 'records', kind: 'record' },
        run: () => ({ records: [] }),
      }),
    ).toThrow("an items element may not declare 'kind'")
  })

  test('a global may not be a builtin', () => {
    expect(() =>
      defineApp({
        name: 't',
        version: '0',
        summary: 's',
        globals: { help: { kind: 'boolean', help: 'h' } },
        commands: {},
      }),
    ).toThrow("global flag 'help'")
  })

  test('paths lists every runnable node', () => {
    expect(app.paths()).toEqual([
      [],
      ['config'],
      ['config', 'list'],
      ['config', 'get'],
      ['nested', 'deep', 'get'],
      ['fails'],
      ['empty'],
      ['help'],
      ['schema'],
    ])
  })

  test('documentSchema and documentContract refuse a node with no data command', () => {
    expect(() => app.documentSchema(['nested'])).toThrow('is not a data command')
    expect(() => app.documentContract([])).toThrow('is not a data command')
    expect(() => app.help(['nope'])).toThrow("no command 'nope'")
  })
})

describe('context', () => {
  test('color follows NO_COLOR, FORCE_COLOR, the terminal and --json', async () => {
    const colors: boolean[] = []
    const probe = defineApp({
      name: 't',
      version: '0',
      summary: 's',
      commands: {
        x: defineCommand({
          summary: 'x',
          output: z.object({}),
          run(_i, ctx) {
            colors.push(ctx.color)
            return {}
          },
        }),
      },
    })
    const tty = { stdin: true, stdout: true, stderr: true, columns: 120 }
    await runApp(probe, ['x'], { env: {}, terminal: tty })
    await runApp(probe, ['x'], { env: { FORCE_COLOR: '0' }, terminal: tty })
    await runApp(probe, ['x'], { env: { FORCE_COLOR: '1' } })
    await runApp(probe, ['x'], { env: {} })
    await runApp(probe, ['x', '--json'], { env: { FORCE_COLOR: '1' }, terminal: tty })
    await runApp(probe, ['x'], { env: { TERM: 'dumb' }, terminal: tty })
    await runApp(probe, ['x'], { env: { NO_COLOR: '1' }, terminal: tty })
    expect(colors).toEqual([true, false, true, false, false, false, false])
  })

  test('colorEnabled is @osdlc/ux detectColorLevel for stdout', async () => {
    const { detectColorLevel } = await import('@osdlc/ux')
    const { colorEnabled } = await import('../../src/io.ts')
    const envs = [
      {},
      { NO_COLOR: '1' },
      { NO_COLOR: '' },
      { FORCE_COLOR: '0' },
      { FORCE_COLOR: '3' },
      { TERM: 'dumb' },
      { NO_COLOR: '1', FORCE_COLOR: '2' },
    ]
    for (const env of envs) {
      for (const stdout of [true, false]) {
        const ctx = {
          ...captureContext({ env }),
          terminal: { stdin: stdout, stdout, stderr: stdout },
        }
        expect(colorEnabled(ctx)).toBe(detectColorLevel({ env, isTTY: stdout }) !== 'none')
      }
    }
  })

  test('warn and note write prefixed lines to stderr', async () => {
    const noisy = defineApp({
      name: 't',
      version: '0',
      summary: 's',
      commands: {
        x: defineCommand({
          summary: 'x',
          output: z.object({}),
          run(_i, ctx) {
            ctx.warn('careful')
            ctx.note('fyi')
            return {}
          },
        }),
      },
    })
    const r = await runApp(noisy, ['x', '--json'])
    expect(r.err).toBe('t: warning: careful\nt: fyi\n')
    expect(r.json()).toEqual({ schemaVersion: 1, kind: 'x' })
  })
})
