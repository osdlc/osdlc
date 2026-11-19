import { describe, expect, test } from 'vitest'
import { z } from 'zod'

import { configFields, defaultControl } from '../src/fields.ts'
import { checkConfigMeta } from '../src/meta.ts'

describe('configFields', () => {
  test('walks objects into leaves in declaration order', () => {
    const fields = configFields({
      a: z.object({ b: z.object({ c: z.string() }), d: z.number() }),
      e: z.boolean(),
    })
    expect(fields.map((f) => f.key)).toEqual(['a.b.c', 'a.d', 'e'])
    expect(fields[0]).toMatchObject({ path: ['a', 'b', 'c'], section: 'a', kind: 'string' })
  })

  test('label, help and control default from the name, description and type', () => {
    const [f] = configFields({ port: z.number().describe('Where to listen.') })
    expect(f).toMatchObject({
      label: 'port',
      description: 'Where to listen.',
      help: 'Where to listen.',
      control: 'number',
    })
  })

  test('meta overrides the defaults', () => {
    const [f] = configFields({
      port: z
        .number()
        .describe('Where.')
        .meta({ label: 'Port', help: 'The TCP port.', control: 'slider' }),
    })
    expect(f).toMatchObject({ label: 'Port', help: 'The TCP port.', control: 'slider' })
    expect(f!.description).toBe('Where.')
  })

  test('hidden on an object hides every field under it', () => {
    const fields = configFields({
      s: z.object({ x: z.string(), y: z.string().meta({ hidden: false }) }).meta({ hidden: true }),
      t: z.string(),
    })
    expect(fields.map((f) => [f.key, f.hidden])).toEqual([
      ['s.x', true],
      ['s.y', true],
      ['t', false],
    ])
  })

  test('reads defaults, optionality, choices and the secret flag', () => {
    const fields = configFields({
      mode: z.enum(['dev', 'prod']).default('dev'),
      note: z.string().optional(),
      s: z.object({ token: z.string().meta({ secret: true }) }),
      req: z.string(),
    })
    const by = Object.fromEntries(fields.map((f) => [f.key, f]))
    expect(by['mode']).toMatchObject({
      default: 'dev',
      optional: true,
      choices: ['dev', 'prod'],
      control: 'select',
    })
    expect(by['note']).toMatchObject({ optional: true, default: undefined, choices: null })
    expect(by['s.token']!.secret).toBe(true)
    expect(by['req']).toMatchObject({ optional: false, secret: false })
  })

  test('a record, an array and an empty object are leaves', () => {
    const fields = configFields({
      paths: z.record(z.string(), z.string()),
      list: z.array(z.string()),
      empty: z.object({}),
    })
    expect(fields.map((f) => [f.key, f.kind, f.control])).toEqual([
      ['paths', 'record', 'map'],
      ['list', 'array', 'list'],
      ['empty', 'object', 'text'],
    ])
  })

  test('a malformed field meta throws, naming the path', () => {
    expect(() => configFields({ s: z.object({ x: z.string().meta({ hidden: 'yes' }) }) })).toThrow(
      /s\.x.*hidden/,
    )
    expect(() => configFields({ x: z.string().meta({ label: '' }) })).toThrow(/label/)
  })

  test('a top-level key may carry field meta next to its section meta', () => {
    const meta = {
      category: 'core',
      consumers: ['a.ts#b'],
      layers: ['project'],
      applies_via: 'read',
      enforcement: 'warn',
      runs_in: ['cli'],
      description: 'x',
    }
    expect(checkConfigMeta({ k: z.string().meta({ ...meta, label: 'K', hidden: true }) })).toEqual(
      [],
    )
    expect(checkConfigMeta({ k: z.string().meta({ ...meta, hidden: 'no' }) })).toHaveLength(1)
  })

  test('defaultControl falls back to text', () => {
    expect(defaultControl('string')).toBe('text')
    expect(defaultControl('int')).toBe('number')
  })
})
