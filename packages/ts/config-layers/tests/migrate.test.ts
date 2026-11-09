/**
 * The migration driver and `defineMigrations`' declarative moves, on plain
 * data. Writing the result back is covered in edit.test.ts, machine.test.ts
 * and loader.test.ts.
 */

import { describe, expect, test } from 'vitest'

import {
  BASE_CONFIG_VERSION,
  currentConfigVersion,
  defineMigrations,
  migrateConfigRaw,
  type ConfigMigration,
} from '../src/migrate.ts'

/** Run `steps` on `raw` and return the migrated document and the warning text. */
function run(raw: Record<string, unknown>, steps: ConfigMigration[]) {
  const out = migrateConfigRaw(raw, steps)
  return { raw: out.raw, applied: out.applied, warnings: out.warnings.map((w) => w.message) }
}

describe('migrateConfigRaw', () => {
  const toV2: ConfigMigration = {
    from: 1,
    to: 2,
    run: ({ dirs, ...rest }, warn) => {
      warn('dirs is now repos')
      return { ...rest, repos: dirs }
    },
  }
  const toV3: ConfigMigration = { from: 2, to: 3, run: (raw) => ({ ...raw, extra: true }) }

  test('runs each step from the file version on and stamps the final version', () => {
    expect(migrateConfigRaw({ dirs: ['/a'] }, [toV2, toV3])).toEqual({
      raw: { repos: ['/a'], extra: true, version: 3 },
      applied: [2, 3],
      warnings: [{ to: 2, message: 'dirs is now repos' }],
    })
    expect(migrateConfigRaw({ version: 2 }, [toV2, toV3]).applied).toEqual([3])
  })

  test('a current or newer file comes back as the same object, with nothing applied', () => {
    const current = { version: 3, repos: [] }
    expect(migrateConfigRaw(current, [toV2, toV3]).raw).toBe(current)
    const newer = { version: 9 }
    expect(migrateConfigRaw(newer, [toV2, toV3])).toEqual({ raw: newer, applied: [], warnings: [] })
  })

  test('a step mutating its input does not reach the caller', () => {
    const raw = { nested: { a: 1 } }
    const mutate: ConfigMigration = {
      from: 1,
      to: 2,
      run: (r) => {
        ;(r.nested as Record<string, unknown>).a = 2
        return r
      },
    }
    expect(migrateConfigRaw(raw, [mutate]).raw).toEqual({ nested: { a: 2 }, version: 2 })
    expect(raw).toEqual({ nested: { a: 1 } })
  })

  test('a non-integer version reads as version 1', () => {
    expect(migrateConfigRaw({ version: '2' }, [toV2]).applied).toEqual([2])
    expect(migrateConfigRaw({ version: 1.5 }, [toV2]).applied).toEqual([2])
  })

  test('currentConfigVersion is the last step, or the base version', () => {
    expect(BASE_CONFIG_VERSION).toBe(1)
    expect(currentConfigVersion([])).toBe(1)
    expect(currentConfigVersion([toV2, toV3])).toBe(3)
  })
})

describe('defineMigrations — the step list', () => {
  test('each step goes from the previous step to its own version', () => {
    const steps = defineMigrations([{ to: 2 }, { to: 4 }])
    expect(steps.map((s) => [s.from, s.to])).toEqual([
      [1, 2],
      [2, 4],
    ])
    expect(run({}, steps)).toEqual({ raw: { version: 4 }, applied: [2, 4], warnings: [] })
  })

  test.each([
    [[{ to: 1 }], /'to' must be an integer greater than 1, got 1/],
    [[{ to: 3 }, { to: 3 }], /migration 2: 'to' must be an integer greater than 3/],
    [[{ to: 2.5 }], /got 2\.5/],
  ])('steps out of order throw: %j', (steps, message) => {
    expect(() => defineMigrations(steps)).toThrow(message)
  })

  test.each([
    ['a', 'a'],
    ['a', 'a.b'],
    ['a.b', 'a'],
  ])('a move from %s to %s throws: one path contains the other', (from, to) => {
    expect(() => defineMigrations([{ to: 2, moves: [[from, to]] }])).toThrow(/contains the other/)
  })

  test('an empty segment in a move throws', () => {
    expect(() => defineMigrations([{ to: 2, moves: [['a..b', 'c']] }])).toThrow(/invalid key path/)
    expect(() => defineMigrations([{ to: 2, moves: [[['a', ''], 'c']] }])).toThrow(
      /invalid key path/,
    )
  })

  test('moves run first, then run sees the moved document and can warn', () => {
    const steps = defineMigrations([
      {
        to: 2,
        moves: [['old', 'new']],
        run: (raw, warn) => {
          warn(`new is ${String(raw.new)}`)
          return { ...raw, ran: true }
        },
      },
    ])
    expect(run({ old: 1 }, steps)).toEqual({
      raw: { new: 1, ran: true, version: 2 },
      applied: [2],
      warnings: ["moved 'old' to 'new'", 'new is 1'],
    })
  })
})

describe('defineMigrations — moves', () => {
  const move = (from: string | string[], to: string | string[], pruneEmpty?: boolean) =>
    defineMigrations([
      { to: 2, moves: [[from, to]], ...(pruneEmpty === undefined ? {} : { pruneEmpty }) },
    ])

  test('moves a nested value and prunes the mappings it left empty', () => {
    const raw = { agent: { claude: { command: 'claude' } }, keep: 1 }
    expect(run(raw, move('agent.claude.command', 'agents.claude.command'))).toEqual({
      raw: { keep: 1, agents: { claude: { command: 'claude' } }, version: 2 },
      applied: [2],
      warnings: ["moved 'agent.claude.command' to 'agents.claude.command'"],
    })
  })

  test('pruning stops at the first mapping that still has keys', () => {
    const raw = { agent: { claude: { command: 'c' }, codex: { command: 'x' } } }
    expect(run(raw, move('agent.claude.command', 'claude_command')).raw).toEqual({
      agent: { codex: { command: 'x' } },
      claude_command: 'c',
      version: 2,
    })
  })

  test('pruneEmpty: false leaves the emptied mappings', () => {
    expect(run({ a: { b: { c: 1 } } }, move('a.b.c', 'd', false)).raw).toEqual({
      a: { b: {} },
      d: 1,
      version: 2,
    })
  })

  test('a mapping that was empty before the step is not pruned', () => {
    expect(run({ a: { b: 1 }, empty: {} }, move('a.b', 'c')).raw).toEqual({
      empty: {},
      c: 1,
      version: 2,
    })
  })

  test('the destination wins: the source is dropped and the value kept', () => {
    const raw = { old: { x: 1 }, new: { x: 2 } }
    expect(run(raw, move('old.x', 'new.x'))).toEqual({
      raw: { new: { x: 2 }, version: 2 },
      applied: [2],
      warnings: ["'old.x' was dropped: 'new.x' is already set, and that value is kept"],
    })
  })

  test('a destination set to null still wins', () => {
    expect(run({ a: 1, b: null }, move('a', 'b')).raw).toEqual({ b: null, version: 2 })
  })

  test('a destination under a scalar cannot be set: the source stays, with a warning', () => {
    const raw = { old: 1, new: 'scalar' }
    expect(run(raw, move('old', 'new.x'))).toEqual({
      raw: { old: 1, new: 'scalar', version: 2 },
      applied: [2],
      warnings: [
        "'old' was not moved: 'new.x' cannot be set, because a segment of it is not a mapping",
      ],
    })
  })

  test('a blocked move leaves no half-built destination behind', () => {
    const raw = { old: 1, a: { b: [1] } }
    expect(run(raw, move('old', 'a.b.c')).raw).toEqual({ old: 1, a: { b: [1] }, version: 2 })
    expect(run({ old: 1, a: 5 }, move('old', 'a.b.c')).raw).toEqual({ old: 1, a: 5, version: 2 })
  })

  test('an absent source is no change and no warning', () => {
    expect(run({ keep: 1 }, move('a.b', 'c'))).toEqual({
      raw: { keep: 1, version: 2 },
      applied: [2],
      warnings: [],
    })
    // A segment of the source path that is not a mapping, or an inherited name, is absent too.
    expect(run({ a: 'x' }, move('a.b', 'c')).raw).toEqual({ a: 'x', version: 2 })
    expect(run({ a: [1] }, move('a.0', 'c')).raw).toEqual({ a: [1], version: 2 })
    expect(run({}, move('constructor.name', 'c')).raw).toEqual({ version: 2 })
  })

  test('a whole mapping moves, and a move may go into an existing mapping', () => {
    const raw = { server: { limits: { a: 1 } }, net: { port: 80 } }
    expect(run(raw, move('server.limits', 'net.limits')).raw).toEqual({
      net: { port: 80, limits: { a: 1 } },
      version: 2,
    })
  })

  test('array paths take a key that holds a dot', () => {
    expect(run({ 'a.b': 1 }, move(['a.b'], ['c', 'd.e'])).raw).toEqual({
      c: { 'd.e': 1 },
      version: 2,
    })
  })

  test('moves in one step run in order, each on the result of the last', () => {
    const steps = defineMigrations([
      {
        to: 2,
        moves: [
          ['a', 'b'],
          ['b', 'c'],
        ],
      },
    ])
    expect(run({ a: 1 }, steps).raw).toEqual({ c: 1, version: 2 })
  })

  test('steps chain across versions, and a file part-way along runs only the rest', () => {
    const steps = defineMigrations([
      { to: 2, moves: [['a', 'b']] },
      { to: 3, moves: [['b', 'c.d']] },
    ])
    expect(run({ a: 1 }, steps).raw).toEqual({ c: { d: 1 }, version: 3 })
    expect(run({ version: 2, a: 1, b: 2 }, steps).raw).toEqual({ a: 1, c: { d: 2 }, version: 3 })
  })
})
