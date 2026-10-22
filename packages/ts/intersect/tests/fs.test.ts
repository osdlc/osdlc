/**
 * Integration harness for the Intersect fs layer (`intersect/fs`).
 *
 * The fs cases in `fixtures/fs.cases.json` are disk-backed: each declares a
 * `tree` of relative file paths. For each case this harness materializes that
 * tree under a FRESH temp dir (system `os.tmpdir()`, never the repo), runs the
 * op with `cwd` pointed at the temp dir, asserts the result equals the case's
 * expected relative paths IN ORDER (the result is sorted by code point), and
 * removes the temp dir in a `finally`. A case may add symbolic links, make
 * directories unreadable, move or break `cwd`, or expect an `IntersectError`. It is the ONLY place fs cases run — the generic harness
 * (`fixtures.test.ts`) skips the `fs.*` namespace, so nothing is double-run.
 */
import { describe, expect, test, type TestContext } from 'vitest'
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

import * as fs from '../src/fs.ts'
import { IntersectError, type Patterns } from '../src/index.ts'
import { effectiveOp, loadCaseFiles, type Case } from './fixtures.ts'
import { importsGlobber, reachableBareImports } from './import-graph.ts'

/** Create every file in `tree` (as empty files) under `root`, making parent dirs. */
async function materialize(root: string, tree: readonly string[]): Promise<void> {
  for (const rel of tree) {
    const abs = join(root, rel)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, '')
  }
}

/** Create the case's symbolic links: `{ link: target }`, the target written as given. */
async function linkAll(root: string, links: Record<string, string>): Promise<void> {
  for (const [link, target] of Object.entries(links)) {
    const abs = join(root, link)
    await mkdir(dirname(abs), { recursive: true })
    await symlink(target, abs)
  }
}

/** Can this process make a directory unreadable? (Not on Windows, not as root.) */
function canLockDirectories(): boolean {
  return process.platform !== 'win32' && process.getuid?.() !== 0
}

/** The `cwd` a case asks for: the temp dir, a path under it, or one relative to the process cwd. */
function caseCwd(c: Case, root: string): string {
  const abs = c.cwd === undefined ? root : join(root, c.cwd)
  return c.cwdRelative === true ? relative(process.cwd(), abs) : abs
}

/** Run the fs op a case targets against its `cwd`. */
async function runFsCase(op: string, c: Case, root: string): Promise<string[]> {
  const opts: fs.FsOptions = { ...(c.opts as fs.FsOptions | undefined), cwd: caseCwd(c, root) }
  switch (op) {
    case 'fs.filesInScope':
      return fs.filesInScope(c.patterns as Patterns, opts)
    case 'fs.resolveIntersection':
      return fs.resolveIntersection(c.a as Patterns, c.b as Patterns, opts)
    default:
      throw new Error(`fs.test.ts: unhandled fs op ${op}`)
  }
}

for (const cf of loadCaseFiles()) {
  const fsCases = cf.cases.filter((c) => effectiveOp(cf, c).startsWith('fs.'))
  if (fsCases.length === 0) continue

  describe(`${cf.file} [integration]`, () => {
    for (const c of fsCases) {
      const op = effectiveOp(cf, c)
      const tree = c.tree as string[] | undefined
      const body = async (ctx: TestContext): Promise<void> => {
        if (!Array.isArray(tree)) {
          throw new Error(`fs case "${c.name}" must declare a "tree" of file paths`)
        }
        const locked = (c.unreadable as string[] | undefined) ?? []
        if (locked.length > 0 && !canLockDirectories()) ctx.skip()
        if (c.symlinks !== undefined && process.platform === 'win32') ctx.skip()
        const root = await mkdtemp(join(tmpdir(), 'intersect-fs-'))
        try {
          await materialize(root, tree)
          await linkAll(root, (c.symlinks as Record<string, string> | undefined) ?? {})
          for (const dir of locked) await chmod(join(root, dir), 0o000)
          if (c.throws) {
            const error = await runFsCase(op, c, root).then(
              () => undefined,
              (e: unknown) => e,
            )
            expect(error, 'the call should reject').toBeDefined()
            expect(error).toBeInstanceOf(IntersectError)
            if (c.code !== undefined) expect((error as IntersectError).code).toBe(c.code)
            return
          }
          const result = await runFsCase(op, c, root)
          // With `absolute`, the case states relative paths; they resolve against the temp dir.
          const want = (c.expect as string[]).map((r) =>
            (c.opts as fs.FsOptions | undefined)?.absolute ? resolve(root, r) : r,
          )
          expect(result).toEqual(want)
        } finally {
          for (const dir of locked) await chmod(join(root, dir), 0o755).catch(() => undefined)
          await rm(root, { recursive: true, force: true })
        }
      }
      if (c.pending) test.todo(c.name, body)
      else test(c.name, body)
    }
  })
}

/**
 * Dependency isolation. Statically resolve the transitive import graph of
 * each package entry by reading the source files this package owns, and collect
 * every bare (non-relative) module specifier. The core entries must NOT reach
 * `tinyglobby`; the fs entry MUST — that positive assertion proves the walker
 * can detect the globber, so the core's absence is a real result, not a broken
 * detector. Fails the moment any core file adds an import of `tinyglobby`.
 */
describe('dependency isolation (globber reaches fs only)', () => {
  const here = import.meta.dirname // .../intersect/tests
  const pkgDir = resolve(here, '..')
  const entry = (rel: string): string => resolve(pkgDir, rel)

  test('core entries (index, segments) do not reach the globber', () => {
    const core = new Set<string>([
      ...reachableBareImports(entry('src/index.ts')),
      ...reachableBareImports(entry('src/segments/index.ts')),
    ])
    expect(importsGlobber(core)).toBe(false)
  })

  test('fs entry does reach the globber (detector is real)', () => {
    expect(importsGlobber(reachableBareImports(entry('src/fs.ts')))).toBe(true)
  })
})
