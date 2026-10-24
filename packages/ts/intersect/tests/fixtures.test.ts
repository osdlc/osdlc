/**
 * Runs the fixture corpus.
 *
 * Loads every `fixtures/*.cases.json` through the loader, then calls the
 * public API for each case by its effective op. A `pending` case registers as
 * `test.todo`. An active case runs and checks that the result deep-equals
 * `expect`, or that the call throws or rejects when `throws` is set. A schema
 * block checks that every corpus file passes the shape check.
 *
 * `fs.*` cases are skipped here on purpose (see the dispatch loop). They need
 * a temp tree on disk, so they run only in `tests/fs.test.ts`. That also keeps
 * this file from importing `../src/fs.ts`, so it never loads `tinyglobby`. fs
 * cases still get the schema check below like every other file.
 */
import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import * as path from '../src/index.ts'
import * as segments from '../src/segments/index.ts'
import {
  assertCaseFile,
  caseFileNames,
  effectiveOp,
  fixturesDir,
  loadCaseFiles,
  type Case,
  type OpName,
} from './fixtures.ts'

/** Call the public API for `op` with the case's inputs. May return a value or a Promise. */
function dispatch(op: OpName, c: Case): unknown {
  const opts = c.opts as path.Options | undefined
  switch (op) {
    case 'parse':
      return path.parse(c.path as string, c.opts as { separator?: string } | undefined)
    case 'segments.intersects':
      return segments.intersects(c.a as path.SegmentPattern, c.b as path.SegmentPattern, opts)
    case 'segments.matches':
      return segments.matches(c.path as path.SegmentPattern, c.pattern as path.SegmentPattern, opts)
    case 'segments.witness':
      return segments.witness(c.a as path.SegmentPattern, c.b as path.SegmentPattern, opts)
    case 'intersects':
      return path.intersects(c.a as path.Patterns, c.b as path.Patterns, opts)
    case 'matches':
      return path.matches(c.path as string, c.patterns as path.Patterns, opts)
    case 'whichMatch':
      return path.whichMatch(c.path as string, c.patterns as path.Patterns, opts)
    case 'overlapping':
      return path.overlapping(c.query as path.Patterns, c.candidates as readonly string[], opts)
    case 'witness':
      return path.witness(c.a as path.Patterns, c.b as path.Patterns, opts)
    case 'registry.applicableTo':
      return path
        .index(c.entries as Iterable<path.Labeled>, opts)
        .applicableTo(c.scope as path.Patterns)
    case 'registry.matching':
      return path.index(c.entries as Iterable<path.Labeled>, opts).matching(c.path as string)
    default:
      // `fs.*` ops are filtered out before dispatch (they run in fs.test.ts).
      throw new Error(`unhandled op: ${String(op)}`)
  }
}

/** Await the dispatch result whether it is sync or a Promise. */
async function runCase(op: OpName, c: Case): Promise<unknown> {
  const result = dispatch(op, c)
  return result instanceof Promise ? await result : result
}

for (const cf of loadCaseFiles()) {
  // Vitest rejects an empty suite; a file of only fs cases has nothing to run here.
  if (cf.cases.every((c) => effectiveOp(cf, c).startsWith('fs.'))) continue
  describe(`${cf.file} [${cf.op}]`, () => {
    for (const c of cf.cases) {
      const op = effectiveOp(cf, c)
      // Skipping, rather than registering test.todo, keeps the fs todo count at
      // 0 and ensures no case runs twice. fs cases run in fs.test.ts.
      if (op.startsWith('fs.')) continue
      const body = async (): Promise<void> => {
        if (c.throws) {
          let error: unknown
          try {
            await runCase(op, c)
          } catch (e) {
            error = e
          }
          expect(error, 'the call should throw').toBeDefined()
          if (c.code !== undefined) {
            expect(error).toBeInstanceOf(path.IntersectError)
            expect((error as path.IntersectError).code).toBe(c.code)
          }
        } else {
          expect(await runCase(op, c)).toEqual(c.expect)
        }
      }
      // The body is attached even for a `pending` case, so removing `pending`
      // runs the case.
      if (c.pending) test.todo(c.name, body)
      else test(c.name, body)
    }
  })
}

describe('schema-lint', () => {
  for (const file of caseFileNames()) {
    test(`${file} conforms to the case-file schema`, () => {
      const parsed: unknown = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'))
      expect(() => assertCaseFile(parsed, file)).not.toThrow()
    })
  }
})
