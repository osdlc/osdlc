import { describe, expect, test } from 'vitest'

import { runApp } from '../../src/testing.ts'
import { fixture } from './fixture.ts'

const CTX = { cwd: '/repo', env: {} }

describe('--output', () => {
  test('jsonl prints one line per item, each with schemaVersion and kind', async () => {
    const { app } = fixture()
    const run = await runApp(app, ['items', '--output', 'jsonl'])
    expect(run.exit).toBe(0)
    expect(
      run.out
        .trimEnd()
        .split('\n')
        .map((l) => JSON.parse(l)),
    ).toEqual([
      { schemaVersion: 1, kind: 'item', name: 'a' },
      { schemaVersion: 1, kind: 'item', name: 'b' },
    ])
  })

  test("an element's or an event's own fields cannot replace a line's kind", async () => {
    const { defineApp, defineCommand } = await import('../../src/command/index.ts')
    const { z } = await import('zod')
    const app = defineApp({
      name: 't',
      version: '0',
      summary: 's',
      commands: {
        rows: defineCommand({
          summary: 'rows',
          output: z.object({ rows: z.array(z.object({ n: z.number() })) }),
          items: { field: 'rows', kind: 'row' },
          run: () => ({ rows: [{ n: 1, kind: 'mine', schemaVersion: 9 }] as { n: number }[] }),
        }),
        tick: defineCommand({
          summary: 'tick',
          output: z.object({}),
          events: { kind: 'tick', schema: z.object({ n: z.number() }) },
          run(_i, ctx) {
            ctx.emit({ n: 1, kind: 'mine', schemaVersion: 9 })
            return {}
          },
        }),
      },
    })
    const rows = await runApp(app, ['rows', '--output', 'jsonl'])
    expect(JSON.parse(rows.out)).toEqual({ schemaVersion: 1, kind: 'row', n: 1 })
    const tick = await runApp(app, ['tick', '--output', 'jsonl'])
    expect(JSON.parse(tick.out.split('\n')[0]!)).toEqual({ schemaVersion: 1, kind: 'tick', n: 1 })
  })

  test('jsonl on a list with no items prints nothing', async () => {
    const f = fixture()
    f.items.length = 0
    const run = await runApp(f.app, ['items', '--output=jsonl'])
    expect([run.exit, run.out]).toEqual([0, ''])
  })

  test('--output json is --json', async () => {
    const { app } = fixture()
    const a = await runApp(app, ['items', '--output', 'json'])
    const b = await runApp(app, ['items', '--json'])
    expect(a.out).toBe(b.out)
    expect(a.json()).toMatchObject({ schemaVersion: 1, kind: 'items' })
  })

  test('jsonl on a command with one document is a usage error', async () => {
    const { app } = fixture()
    const run = await runApp(app, ['fails', '--output', 'jsonl'])
    expect(run.exit).toBe(2)
    expect(run.err).toContain("'tooly fails' prints one document; use --json")
  })

  test('--json with --output jsonl is a usage error', async () => {
    const { app } = fixture()
    const run = await runApp(app, ['items', '--json', '--output', 'jsonl'])
    expect(run.exit).toBe(2)
    expect(run.err).toContain('--json and --output jsonl ask for different forms')
  })

  test('an unknown mode is a usage error', async () => {
    const { app } = fixture()
    expect((await runApp(app, ['items', '--output', 'yaml'])).exit).toBe(2)
  })

  test('an interactive command refuses --output json', async () => {
    const { app } = fixture()
    expect((await runApp(app, ['tui', '--output', 'json'])).exit).toBe(2)
  })

  test('help honours --output json', async () => {
    const { app } = fixture()
    const run = await runApp(app, ['items', '--help', '--output', 'json'])
    expect(run.json()).toMatchObject({ kind: 'help' })
  })
})

describe('events', () => {
  test('text mode prints each event as it comes, then the text form', async () => {
    const { app } = fixture()
    const run = await runApp(app, ['watch', '--steps', '2'])
    expect(run.out).toBe('step 1\nstep 2\n{\n  "steps": 2,\n  "cancelled": false\n}\n')
  })

  test('jsonl prints each event, then the document, one per line', async () => {
    const { app } = fixture()
    const run = await runApp(app, ['watch', '--steps', '2', '--output', 'jsonl'])
    expect(
      run.out
        .trimEnd()
        .split('\n')
        .map((l) => JSON.parse(l)),
    ).toEqual([
      { schemaVersion: 1, kind: 'step', step: 1 },
      { schemaVersion: 1, kind: 'step', step: 2 },
      { schemaVersion: 1, kind: 'watch', steps: 2, cancelled: false },
    ])
  })

  test('--json prints only the document', async () => {
    const { app } = fixture()
    const run = await runApp(app, ['watch', '--json'])
    expect(run.json()).toEqual({ schemaVersion: 1, kind: 'watch', steps: 3, cancelled: false })
  })

  test('a command with no events cannot emit one', async () => {
    const { app } = fixture()
    const result = await app.call(['items', 'list'], {}, CTX, {
      surface: 'http',
    })
    expect(result.status).toBe('ok')
    const { commandKit, defineApp } = await import('../../src/command/index.ts')
    const { z } = await import('zod')
    const bad = defineApp({
      name: 'bad',
      version: '0',
      summary: 'emits without events',
      commands: {
        go: commandKit({ globals: {} }).command({
          summary: 'go',
          output: z.object({}),
          run(_i, ctx) {
            ctx.emit({ x: 1 })
            return {}
          },
        }),
      },
    })
    const called = await bad.call(['go'], {}, CTX, { surface: 'mcp' })
    expect(called).toMatchObject({ status: 'error', exit: 1 })
    expect(called.status === 'error' && called.message).toContain('declares no events')
  })

  test('the schema lists items, events, exposure and the hints', () => {
    const { app } = fixture()
    const by = (p: string) => app.schema().find((e) => e.path.join(' ') === p)!
    expect(by('items list')).toMatchObject({
      readOnly: true,
      exposure: 'all',
      items: { field: 'items', kind: 'item' },
    })
    expect(by('items clear')).toMatchObject({ destructive: true })
    expect(by('secret').exposure).toBe('cli-only')
    expect(by('trust').exposure).toBe('by-input')
    expect(by('config set').exposure).toBe('by-input')
    expect(by('watch').events).toMatchObject({ kind: 'step' })
    expect(by('watch').events!.schema).toMatchObject({ type: 'object' })
  })
})

describe('App.call', () => {
  test('runs a command from a JSON object and returns its document', async () => {
    const { app, items } = fixture()
    const result = await app.call(['items', 'add'], { name: 'c', times: 2 }, CTX, {
      surface: 'http',
      globals: { dir: '/x' },
    })
    expect(result).toEqual({
      status: 'ok',
      exit: 0,
      document: expect.objectContaining({ kind: 'items', dir: '/x' }),
      stderr: 'tooly: added c\n',
    })
    expect(items).toEqual(['a', 'b', 'c', 'c'])
  })

  test('wrong arguments are usage errors', async () => {
    const { app } = fixture()
    const cases: [unknown, string][] = [
      [{}, "'name' is required"],
      [{ name: 1 }, "'name' takes a string"],
      [{ name: 'x', nope: true }, "unknown argument 'nope'"],
      [{ name: 'x', times: -1 }, "'times' takes a whole number"],
      [{ name: 'x', rest: 'no' }, "'rest' takes an array of strings"],
      [[], 'the arguments must be a JSON object'],
    ]
    for (const [args, message] of cases) {
      const result = await app.call(['items', 'add'], args, CTX, { surface: 'mcp' })
      expect(result).toMatchObject({ status: 'error', exit: 2, usage: true, message })
    }
  })

  test('flag kinds take their JSON types, with defaults', async () => {
    const { commandKit, defineApp } = await import('../../src/command/index.ts')
    const { z } = await import('zod')
    const seen: unknown[] = []
    const app = defineApp({
      name: 'kinds',
      version: '0',
      summary: 'every flag kind',
      commands: {
        go: commandKit({ globals: {} }).command({
          summary: 'go',
          flags: {
            b: { kind: 'boolean', help: 'b' },
            n: { kind: 'boolean', negatable: true, help: 'n' },
            t: { kind: 'tristate', help: 't' },
            s: { kind: 'string', default: 'd', help: 's' },
            r: { kind: 'string', required: true, help: 'r' },
            e: { kind: 'enum', choices: ['x', 'y'], help: 'e' },
            l: { kind: 'list', default: ['z'], help: 'l' },
            m: { kind: 'list', help: 'm' },
          },
          positionals: [
            { name: 'first', help: 'first' },
            { name: 'more', variadic: true, help: 'more' },
          ],
          output: z.object({}),
          run(input) {
            seen.push(input)
            return {}
          },
        }),
      },
    })
    const ok = await app.call(['go'], { r: 'R', first: 'f', more: ['g', 'h'] }, CTX, {
      surface: 'mcp',
    })
    expect(ok.status).toBe('ok')
    expect(seen[0]).toEqual({
      flags: {
        b: false,
        n: true,
        t: undefined,
        s: 'd',
        r: 'R',
        e: undefined,
        l: ['z'],
        m: undefined,
      },
      globals: {},
      positionals: ['f', 'g', 'h'],
      rest: [],
    })
    const bad: [Record<string, unknown>, string][] = [
      [{}, "'r' is required"],
      [{ r: 'R', b: 'yes' }, "'b' takes true or false"],
      [{ r: 'R', t: 1 }, "'t' takes true or false"],
      [{ r: 'R', e: 'z' }, "'e' takes one of x, y"],
      [{ r: 'R', l: 'z' }, "'l' takes an array of strings"],
      [{ r: 'R', s: 3 }, "'s' takes a string"],
      [{ r: 'R', more: ['g'] }, "'more' needs 'first' too"],
      [{ r: 'R', first: 'f', more: 'g' }, "'more' takes an array of strings"],
    ]
    for (const [args, message] of bad) {
      expect(await app.call(['go'], args, CTX, { surface: 'mcp' })).toMatchObject({
        status: 'error',
        message,
      })
    }
  })

  test('a command error keeps its exit code and hint', async () => {
    const { app } = fixture()
    expect(await app.call(['fails'], {}, CTX, { surface: 'mcp' })).toEqual({
      status: 'error',
      exit: 1,
      message: 'it broke',
      hint: 'try again',
      stderr: '',
    })
  })

  test('refuses a missing, interactive or cli-only command', async () => {
    const { app } = fixture()
    expect(await app.call(['nope'], {}, CTX, { surface: 'mcp' })).toMatchObject({
      status: 'refused',
      reason: 'not-found',
    })
    expect(await app.call(['tui'], {}, CTX, { surface: 'mcp' })).toMatchObject({
      status: 'refused',
      reason: 'interactive',
    })
    expect(await app.call(['secret'], {}, CTX, { surface: 'mcp' })).toMatchObject({
      status: 'refused',
      reason: 'cli-only',
    })
    expect(
      await app.call(['secret'], {}, CTX, { surface: 'http', allowCliOnly: true }),
    ).toMatchObject({ status: 'ok' })
  })

  test('granting trust is cli-only; showing and removing it are not', async () => {
    const { app, trusted } = fixture()
    expect(await app.call(['trust'], {}, CTX, { surface: 'mcp' })).toMatchObject({
      status: 'refused',
      reason: 'cli-only',
    })
    expect(trusted.size).toBe(0)
    expect(await app.call(['trust'], { show: true }, CTX, { surface: 'mcp' })).toMatchObject({
      status: 'ok',
      document: { action: 'show' },
    })
    expect(await app.call(['trust'], { untrust: true }, CTX, { surface: 'mcp' })).toMatchObject({
      status: 'ok',
      exit: 1,
    })
    // The command line still grants it.
    expect((await runApp(app, ['trust'], { cwd: '/repo' })).exit).toBe(0)
    expect(trusted.has('/repo')).toBe(true)
  })

  test('writing a trust key through config is cli-only; other keys are not', async () => {
    const { app, config } = fixture()
    for (const key of ['trust.paths', 'trust', 'trust.paths.0']) {
      expect(
        await app.call(['config', 'set'], { key, value: '["/"]' }, CTX, { surface: 'http' }),
      ).toMatchObject({ status: 'refused', reason: 'cli-only' })
      expect(
        await app.call(['config', 'unset'], { key, user: true }, CTX, { surface: 'http' }),
      ).toMatchObject({ status: 'refused', reason: 'cli-only' })
    }
    expect(config['user']!['trust.paths']).toEqual(['/home/**'])
    expect(
      await app.call(['config', 'set'], { key: 'discovery', value: 'off' }, CTX, {
        surface: 'http',
      }),
    ).toMatchObject({ status: 'ok' })
    expect(config['project']!['discovery']).toBe('off')
    expect(
      await app.call(['config', 'get'], { key: 'trust.paths' }, CTX, { surface: 'mcp' }),
    ).toMatchObject({ status: 'ok' })
    expect((await runApp(app, ['config', 'set', 'trust.paths', '[]', '--user'])).exit).toBe(0)
  })

  test("a call's events reach onEvent as lines, and its signal reaches the command", async () => {
    const f = fixture()
    const lines: unknown[] = []
    const aborter = new AbortController()
    const pending = f.app.call(['watch'], { steps: '1', hang: true }, CTX, {
      surface: 'http',
      signal: aborter.signal,
      onEvent: (line) => lines.push(line),
    })
    aborter.abort()
    expect(await pending).toMatchObject({ status: 'ok', document: { cancelled: true } })
    expect(lines).toEqual([{ schemaVersion: 1, kind: 'step', step: 1 }])
  })

  test('argsSchema has the command’s own flags and positionals, not the globals', () => {
    const { app } = fixture()
    const schema = app.argsSchema(['items', 'add']) as { properties: Record<string, unknown> }
    expect(Object.keys(schema.properties)).toEqual(['times', 'name', 'rest'])
    expect(() => app.argsSchema(['items', 'nope'])).toThrow("no command 'items nope'")
  })
})

test('items must name an array of the output, and events may not use the reserved keys', async () => {
  const { defineCommand } = await import('../../src/command/index.ts')
  const { z } = await import('zod')
  expect(() =>
    defineCommand({
      summary: 's',
      output: z.object({ n: z.number() }),
      items: { field: 'n', kind: 'x' },
      run: () => ({ n: 1 }),
    }),
  ).toThrow("items.field 'n' is not an array of the output")
  expect(() =>
    defineCommand({
      summary: 's',
      output: z.object({}),
      events: { schema: z.object({ kind: z.string() }), kind: 'e' },
      run: () => ({}),
    }),
  ).toThrow("events.schema may not declare 'kind'")
})
