import { describe, expect, test } from 'vitest'
import { z } from 'zod'

import { commandKit, defineApp } from '../../src/command/index.ts'
import { checkApp, runApp } from '../../src/testing.ts'
import { inputSchema } from '../../src/command/schema.ts'

const kit = commandKit({
  globals: {
    dir: { kind: 'string', short: 'C', valueName: 'path', help: 'the directory' },
  } as const,
})

const get = kit.command({
  summary: 'one value',
  description: 'Prints one value, read from the files this tool knows about.',
  flags: {
    secret: { kind: 'boolean', help: 'include secret values', hidden: true },
    format: { kind: 'enum', choices: ['a', 'b'] as const, default: 'a', help: 'the format' },
  },
  positionals: [{ name: 'key', required: true, help: 'the key' }],
  output: z.object({ key: z.string(), value: z.string().optional() }),
  examples: ['config get size'],
  exits: { 12: 'nothing to read' },
  run: ({ positionals }) => ({ key: positionals[0]! }),
})

const ui = kit.command({ summary: 'the UI', interactive: true, run: () => 0 })

const app = defineApp({
  name: 'tooly',
  version: '1.0.0',
  summary: 'a test tool',
  description: 'A tool for tests.',
  globals: kit.globals,
  commands: {
    config: kit.group({
      summary: 'settings',
      commands: {
        get,
        deep: kit.group({ summary: 'deeper', commands: { leaf: get } }),
        secret: kit.group({ summary: 'hidden group', hidden: true, commands: { get } }),
      },
    }),
    ui,
  },
})

describe('help', () => {
  test('help alone lists the top-level commands, one line each', async () => {
    const r = await runApp(app, ['help'])
    expect(r.exit).toBe(0)
    expect(r.out).toContain('commands:\n  config  settings (2 commands)\n  ui ')
    expect(r.out).not.toContain('deep')
    expect(r.out).toContain('More: "tooly help --all"')
  })

  test('--depth expands nested commands', async () => {
    const r = await runApp(app, ['help', '--depth', '2'])
    expect(r.out).toContain('  config  settings\n    get ')
    expect(r.out).toContain('    deep  deeper (1 command)')
    const all = await runApp(app, ['help', '--depth', 'all'])
    expect(all.out).toContain('      leaf')
  })

  test('help <command> shows that node; --help on a command is the same', async () => {
    const a = await runApp(app, ['help', 'config', 'get'])
    const b = await runApp(app, ['config', 'get', '--help'])
    expect(a.out).toBe(b.out)
    expect(a.out).toContain('usage: tooly config get [options] <key>')
    expect(a.out).toContain('--format <value>  the format (one of a, b; default "a")')
    expect(a.out).not.toContain('--secret')
    expect(a.out).not.toContain('Prints one value')
  })

  test('--full and --all add the description, hidden flags, exit codes and examples', async () => {
    const full = await runApp(app, ['help', 'config', 'get', '--full'])
    const all = await runApp(app, ['config', 'get', '--help', '--all'])
    expect(full.out).toBe(all.out)
    for (const text of [
      'Prints one value',
      '--secret',
      'exit codes:',
      '  12  nothing to read',
      'tooly config get size',
    ]) {
      expect(full.out).toContain(text)
    }
  })

  test('hidden groups appear only in the full help', async () => {
    expect((await runApp(app, ['help', 'config'])).out).not.toContain('hidden group')
    expect((await runApp(app, ['help', 'config', '--all'])).out).toContain('hidden group')
  })

  test('the JSON form says the same as the text', async () => {
    const r = await runApp(app, ['help', 'config', '--json'])
    const doc = r.json<{ kind: string; help: { commands: { name: string; more?: number }[] } }>()
    expect(doc.kind).toBe('help')
    expect(doc.help.commands.map((c) => c.name)).toEqual(['get', 'deep'])
    expect(doc.help.commands[1]!.more).toBe(1)
    expect((await runApp(app, ['config', '--help', '--json'])).out).toBe(r.out)
  })

  test('the root lists --version and the global flags', async () => {
    const help = app.help([], { depth: 0 })
    expect(help.flags!.map((f) => f.spelling)).toEqual([
      '-C, --dir <path>',
      '--version',
      '--json',
      '--output <mode>',
      '-h, --help',
      '--all',
    ])
    expect(app.help(['config'], { depth: 0 }).flags!.map((f) => f.name)).not.toContain('version')
  })

  test('a bad --depth or an unknown command is exit 2', async () => {
    expect((await runApp(app, ['help', '--depth', 'x'])).exit).toBe(2)
    const r = await runApp(app, ['help', 'nope'])
    expect(r.exit).toBe(2)
    expect(r.err).toContain("no command 'nope'")
  })

  test('help text wraps to the terminal width', async () => {
    const narrow = await runApp(app, ['help', 'config', 'get', '--all'], {
      terminal: { stdin: true, stdout: true, stderr: true, columns: 40 },
    })
    for (const line of narrow.out.split('\n')) expect(line.length).toBeLessThanOrEqual(40)
    expect(app.helpText(['config', 'get'], { full: true, width: 100 })).toContain(
      '--all             with --help: every flag, the long description and the exit codes',
    )
  })
})

describe('schema', () => {
  test('lists every node under the path with input and output schemas', async () => {
    const r = await runApp(app, ['schema', 'config', '--json'])
    const doc = r.json<{
      kind: string
      commands: { command: string; kind?: string; output?: unknown; group: boolean }[]
    }>()
    expect(doc.kind).toBe('schema')
    expect(doc.commands.map((c) => c.command)).toEqual([
      'tooly config',
      'tooly config get',
      'tooly config deep',
      'tooly config deep leaf',
      'tooly config secret',
      'tooly config secret get',
    ])
    expect(doc.commands[0]).toMatchObject({ group: true })
    expect(doc.commands[0]!.output).toBeUndefined()
    expect(doc.commands[1]!.kind).toBe('config-get')
  })

  test('the output schema fixes schemaVersion and kind', () => {
    const schema = app.documentSchema(['config', 'get']) as {
      properties: Record<string, { const?: unknown }>
      required: string[]
    }
    expect(schema.properties['schemaVersion']!.const).toBe(1)
    expect(schema.properties['kind']!.const).toBe('config-get')
    expect(schema.required).toEqual(['schemaVersion', 'kind', 'key'])
  })

  test('an interactive command has an input schema and no output schema', () => {
    const entry = app.schema(['ui'])[0]!
    expect(entry.interactive).toBe(true)
    expect(entry.input).toBeDefined()
    expect(entry.output).toBeUndefined()
  })

  test('the whole tree, including help and schema, has schemas', async () => {
    const r = await runApp(app, ['schema'])
    expect(r.exit).toBe(0)
    expect(JSON.parse(r.out).commands.length).toBe(10)
    expect(checkApp(app)).toEqual([])
  })

  test('inputSchema covers every flag kind and positional', () => {
    const schema = inputSchema(
      {
        b: { kind: 'boolean', help: 'b' },
        n: { kind: 'boolean', negatable: true, help: 'n' },
        t: { kind: 'tristate', help: 't' },
        c: { kind: 'count', short: 'v', help: 'c' },
        s: { kind: 'string', required: true, help: 's' },
        sd: { kind: 'string', default: 'x', help: 'sd' },
        e: { kind: 'enum', choices: ['p', 'q'], help: 'e' },
        l: { kind: 'list', default: ['z'], help: 'l' },
        binDir: { kind: 'list', help: 'l' },
      },
      [{ name: 'files', variadic: true, required: true }],
    ) as { properties: Record<string, Record<string, unknown>>; required: string[] }
    expect(schema.properties['n']).toMatchObject({
      type: 'boolean',
      default: true,
      'x-cli': { flag: '--no-n' },
    })
    expect(schema.properties['t']).toMatchObject({ 'x-cli': { flag: '--t', off: '--no-t' } })
    expect(schema.properties['c']).toMatchObject({ type: 'integer', 'x-cli': { short: '-v' } })
    expect(schema.properties['sd']).toMatchObject({ default: 'x' })
    expect(schema.properties['e']).toMatchObject({ enum: ['p', 'q'] })
    expect(schema.properties['l']).toMatchObject({ type: 'array', default: ['z'] })
    expect(schema.properties['binDir']).toMatchObject({ 'x-cli': { flag: '--bin-dir' } })
    expect(schema.properties['files']).toMatchObject({
      type: 'array',
      'x-cli': { positional: 0, variadic: true },
    })
    expect(schema.required).toEqual(['s', 'files'])
  })
})
