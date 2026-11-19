import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import { machineConfigFile } from '../src/machine.ts'
import { validateStandard, type StandardSchemaV1 } from '../src/standard.ts'
import { sandbox, type Sandbox, VENDOR_DIRS } from './support.ts'

let sb: Sandbox
beforeEach(() => {
  sb = sandbox()
})
afterEach(() => sb.dispose())

/** A validator written by hand: `name` a string (default 'x'), `count` a number (default 0). */
const handWritten: StandardSchemaV1<unknown, { name: string; count: number }> = {
  '~standard': {
    version: 1,
    vendor: 'hand-written',
    validate: (value) => {
      const v = value as Record<string, unknown>
      const issues: { message: string; path: (string | { key: string })[] }[] = []
      const name = v.name ?? 'x'
      const count = v.count ?? 0
      if (typeof name !== 'string') issues.push({ message: 'not a string', path: ['name'] })
      if (typeof count !== 'number')
        issues.push({ message: 'not a number', path: [{ key: 'count' }] })
      return issues.length > 0
        ? { issues }
        : { value: { name: name as string, count: count as number } }
    },
  },
}

describe('validateStandard', () => {
  test('returns the output of a passing value', () => {
    expect(validateStandard(handWritten, { name: 'a' })).toEqual({
      ok: true,
      value: { name: 'a', count: 0 },
    })
  })

  test('maps issue paths, plain and wrapped, to strings', () => {
    expect(validateStandard(handWritten, { name: 1, count: 'x' })).toEqual({
      ok: false,
      issues: [
        { path: ['name'], message: 'not a string' },
        { path: ['count'], message: 'not a number' },
      ],
    })
  })

  test('reads a zod schema too', () => {
    const schema = z.object({ a: z.object({ b: z.number() }) })
    const r = validateStandard(schema, { a: { b: 'x' } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]!.path).toEqual(['a', 'b'])
  })

  test('refuses an asynchronous validator', () => {
    const asyncSchema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'async',
        validate: async (value) => ({ value }),
      },
    }
    expect(() => validateStandard(asyncSchema, {})).toThrow(/synchronously/)
  })
})

describe('machineConfigFile with a non-zod schema', () => {
  const make = () =>
    machineConfigFile({
      tool: 'tooly',
      schema: handWritten,
      vendorDirs: VENDOR_DIRS,
      dirs: () => sb.dirs,
    })

  function load(text: string) {
    const file = join(sb.root, 'std.yaml')
    writeFileSync(file, text)
    const m = make()
    process.env[m.env] = file
    return m.loadWithIssues()
  }

  test('a valid file loads', () => {
    expect(load('name: a\ncount: 2\n')).toEqual({ value: { name: 'a', count: 2 }, issues: [] })
  })

  test('an invalid section takes its default and is reported', () => {
    const r = load('name: a\ncount: nope\n')
    expect(r.value).toEqual({ name: 'a', count: 0 })
    expect(r.issues).toEqual([
      { path: ['count'], code: 'invalid', message: "not a number; using the default for 'count'" },
    ])
  })

  test('a key the validator ignores is simply not in the value', () => {
    expect(load('name: a\nextra: 1\n').value).toEqual({ name: 'a', count: 0 })
  })

  test('a missing file gives the defaults', () => {
    const m = make()
    process.env[m.env] = join(sb.root, 'absent.yaml')
    expect(m.load()).toEqual({ name: 'x', count: 0 })
  })
})
