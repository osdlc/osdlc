/** Machine-scope plugins: roots outside any checkout, and the containment that blocks a row leaving them. */

import { afterEach, describe, expect, test } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { OUTSIDE_ROOTS, clean, containedIn, plan, survey } from '../src/index.ts'
import type { Candidate, Ctx, Plugin } from '../src/index.ts'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})
const temp = (): string => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'host-cleaner-roots-')))
  dirs.push(d)
  return d
}

const ctx: Ctx = { cwd: '/', targets: [], allow: [] }

/** A cache cleaner for one directory: every file in `paths` is a candidate, `rm` deletes it. */
function cachePlugin(roots: string[], paths: string[]): Plugin {
  return {
    name: 'cache',
    detect: () => true,
    roots: () => roots,
    discover: () =>
      paths.map((path): Candidate => ({
        id: `file:${path}`,
        kind: 'file',
        path,
        owner: 'cache',
        why: 'old',
        evidence: {},
        unattended: true,
      })),
    delete: (c) => {
      rmSync(c.path, { recursive: true })
      return `removed ${c.path}`
    },
  }
}

describe('containedIn', () => {
  test('strictly inside, not the root itself, not a sibling, not through a link that leaves', () => {
    const base = temp()
    const root = join(base, 'cache')
    const other = join(base, 'other')
    mkdirSync(root)
    mkdirSync(other)
    writeFileSync(join(root, 'a'), '')
    writeFileSync(join(other, 'b'), '')
    symlinkSync(other, join(root, 'out'))
    expect(containedIn([root], join(root, 'a'))).toBe(root)
    expect(containedIn([root], join(root, 'new', 'file'))).toBe(root)
    expect(containedIn([root], root)).toBeNull()
    expect(containedIn([root], join(base, 'cache-2', 'a'))).toBeNull()
    expect(containedIn([root], join(root, 'out', 'b'))).toBeNull()
    expect(containedIn([root], join(root, '..', 'other', 'b'))).toBeNull()
    expect(containedIn([join(base, 'missing')], join(root, 'a'))).toBeNull()
    expect(containedIn([root], join(root, '..cache'))).toBe(root)
    expect(containedIn([root], join(root, 'out', '..', 'victim'))).toBeNull()
    expect(containedIn([root], 'relative/path')).toBeNull()
  })
})

describe('a machine-scope plugin through plan, check, run and receipt', () => {
  test('rows inside the roots run; a row that resolves outside is blocked and its file stays', () => {
    const base = temp()
    const root = join(base, 'cache')
    const other = join(base, 'other')
    mkdirSync(root)
    mkdirSync(other)
    writeFileSync(join(root, 'old'), 'x')
    writeFileSync(join(other, 'precious'), 'x')
    symlinkSync(other, join(root, 'link'))
    const p = cachePlugin([root], [join(root, 'old'), join(root, 'link', 'precious')])

    const s = survey([p], ctx)
    expect(s.candidates).toHaveLength(2)
    expect(s.objections).toEqual([
      expect.objectContaining({ level: 'refuse', code: OUTSIDE_ROOTS, by: 'host-cleaner' }),
    ])

    const receiptPath = join(base, 'receipt.json')
    const receipt = clean(plan(s), [p], ctx, { receiptPath })
    expect(receipt.steps.map((x) => [x.id, x.result])).toEqual([
      [`file:${join(root, 'old')}`, 'ok'],
    ])
    expect(existsSync(join(root, 'old'))).toBe(false)
    expect(existsSync(join(other, 'precious'))).toBe(true)
    expect(JSON.parse(readFileSync(receiptPath, 'utf8')).status).toBe('complete')
  })

  test('a path swapped for a link after the re-check fails its step instead of deleting outside', () => {
    const base = temp()
    const root = join(base, 'cache')
    const other = join(base, 'other')
    mkdirSync(root)
    mkdirSync(other)
    writeFileSync(join(other, 'precious'), 'x')
    const victim = join(root, 'dir')
    mkdirSync(victim)
    const p = cachePlugin([root], [victim])
    const swapping: Plugin = {
      name: 'swap',
      detect: () => true,
      prepare: () => {
        rmSync(victim, { recursive: true })
        symlinkSync(other, victim)
      },
    }
    const receipt = clean(plan(survey([p, swapping], ctx)), [p, swapping], ctx)
    expect(receipt.steps[0]!.result).toBe('failed')
    expect(existsSync(join(other, 'precious'))).toBe(true)
  })
})
