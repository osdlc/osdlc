/**
 * API behaviour the shared corpus cannot state: the `Matcher` surface, and
 * errors for arguments the type system would block. (The Rust peer crate is
 * typed, so these cases are TypeScript-only.)
 */
import { describe, expect, test } from 'vitest'

import { compile, index, intersects, matches, overlapping, witness } from '../src/index.ts'
import * as root from '../src/index.ts'
import * as segments from '../src/segments/index.ts'
import { IntersectError } from '../src/index.ts'

/** Run `body` and return the `IntersectError` it throws, failing if it throws anything else. */
function thrown(body: () => unknown): IntersectError {
  try {
    body()
  } catch (e) {
    expect(e).toBeInstanceOf(IntersectError)
    return e as IntersectError
  }
  throw new Error('expected the call to throw')
}

describe('Matcher.overlapping and the free overlapping filter opposite sides', () => {
  const taskA = ['src/api/**', 'src/db/schema.ts']
  const taskB = ['src/api/routes/*.ts', 'docs/**']

  test('the free function returns a subset of its first argument', () => {
    expect(overlapping(taskA, taskB)).toEqual(['src/api/**'])
  })

  test('the method returns a subset of its argument, in the order given', () => {
    expect(compile(taskA).overlapping(taskB)).toEqual(['src/api/routes/*.ts'])
    expect(compile(taskA).overlapping(['docs/**', 'src/db/schema.ts', 'src/api/x.ts'])).toEqual([
      'src/db/schema.ts',
      'src/api/x.ts',
    ])
  })

  test('both take Patterns: a single string is a one-element set', () => {
    expect(compile('src/**').overlapping('src/a.ts')).toEqual(['src/a.ts'])
    expect(overlapping('src/**', 'src/a.ts')).toEqual(['src/**'])
    expect(overlapping('src/**', 'docs/a.ts')).toEqual([])
  })
})

describe('a Matcher argument', () => {
  test('intersects and witness accept a Matcher', () => {
    const scope = compile(['src/api/**'])
    expect(compile('src/**').intersects(scope)).toBe(true)
    expect(compile('src/**').witness(scope)).toBe('src/api')
    expect(compile('docs/**').intersects(scope)).toBe(false)
  })

  test("the receiver's options apply; the argument's own options are ignored", () => {
    const insensitive = compile('a', { caseInsensitive: true })
    const sensitive = compile('A')
    // The receiver decides, in both directions.
    expect(sensitive.intersects(insensitive)).toBe(false)
    expect(insensitive.intersects(sensitive)).toBe(true)
  })
})

describe('IntersectError', () => {
  test('carries a code and a name, and is an Error', () => {
    const e = thrown(() =>
      index([
        { id: 'a', patterns: 'x' },
        { id: 'a', patterns: 'y' },
      ]),
    )
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('IntersectError')
    expect(e.code).toBe('DUPLICATE_REGISTRY_ID')
    expect(e.message).toBe("duplicate registry id 'a'")
  })

  test('the ./segments entry exports the same class', () => {
    expect(segments.IntersectError).toBe(IntersectError)
  })

  test('nesting 10,000 deep throws PATTERN_TOO_DEEP, not a RangeError', () => {
    const deep = '{'.repeat(10_000) + 'a' + '}'.repeat(10_000)
    expect(thrown(() => intersects(deep, 'a')).code).toBe('PATTERN_TOO_DEEP')
    expect(thrown(() => segments.intersects([deep], ['a'])).code).toBe('PATTERN_TOO_DEEP')
  })

  test('unsupported syntax throws when the pattern is compiled, not at the first query', () => {
    expect(thrown(() => compile('a{1..3}')).code).toBe('UNSUPPORTED_SYNTAX')
    expect(thrown(() => compile(['ok', '+(a|b)'])).code).toBe('UNSUPPORTED_SYNTAX')
  })

  test('a wrong argument type throws INVALID_ARGUMENT, not a TypeError', () => {
    const bad: unknown[] = [undefined, null, 123, {}, [1], ['a', 2]]
    for (const value of bad) {
      const v = value as string
      expect(thrown(() => intersects(v, 'a')).code, `intersects(${String(value)})`).toBe(
        'INVALID_ARGUMENT',
      )
      expect(thrown(() => intersects('a', v)).code).toBe('INVALID_ARGUMENT')
      expect(thrown(() => witness('a', v)).code).toBe('INVALID_ARGUMENT')
      expect(thrown(() => overlapping('a', v)).code).toBe('INVALID_ARGUMENT')
      expect(thrown(() => compile('a').overlapping(v)).code).toBe('INVALID_ARGUMENT')
      expect(thrown(() => compile('a').intersects(v)).code).toBe('INVALID_ARGUMENT')
    }
    for (const value of [undefined, null, 123, {}, ['a']]) {
      const v = value as string
      expect(thrown(() => matches(v, 'a')).code).toBe('INVALID_ARGUMENT')
      expect(thrown(() => root.whichMatch(v, 'a')).code).toBe('INVALID_ARGUMENT')
      expect(thrown(() => index([{ id: 'x', patterns: 'a' }]).matching(v)).code).toBe(
        'INVALID_ARGUMENT',
      )
      expect(thrown(() => root.parse(v)).code).toBe('INVALID_ARGUMENT')
    }
  })
})

describe('./fs compiles the patterns before it walks', () => {
  test('a bad pattern with a missing cwd reports the pattern, not IO_ERROR', async () => {
    const { filesInScope, resolveIntersection } = await import('../src/fs.ts')
    const cwd = '/definitely/not/a/directory'
    await expect(filesInScope('a{1..3}', { cwd })).rejects.toMatchObject({
      code: 'UNSUPPORTED_SYNTAX',
    })
    await expect(filesInScope(undefined as never, { cwd })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    })
    await expect(filesInScope('a', { cwd, ignore: ['+(a|b)'] })).rejects.toMatchObject({
      code: 'UNSUPPORTED_SYNTAX',
    })
    await expect(resolveIntersection('a', '[a/b]', { cwd })).rejects.toMatchObject({
      code: 'UNSUPPORTED_SYNTAX',
    })
    // A good pattern still reaches the walk and reports the bad cwd.
    await expect(filesInScope('a', { cwd })).rejects.toMatchObject({ code: 'IO_ERROR' })
  })
})
