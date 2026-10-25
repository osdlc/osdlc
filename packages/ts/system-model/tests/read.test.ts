/**
 * Bounded reads: what a repository can make detection and the runners read.
 * Each case uses a real tree, since the rules are about what is on disk.
 */

import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'vitest'

import { runChecked, spawnRunner } from '@osdlc/command-seam'

import { builtins } from '../src/builtins.ts'
import { createLister } from '../src/discovery.ts'
import { fingerprint } from '../src/fingerprint.ts'
import { tasks } from '../src/model.ts'
import { createProject } from '../src/project.ts'
import { MAX_READ_BYTES, readBounded, readRegular } from '../src/read.ts'
import { collect, fakeRunners, fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

describe('readBounded', () => {
  test('reads a regular file, and a symlink that stays inside the root', async () => {
    const dir = await root({ 'real/justfile': 'build:\n  true\n' })
    await symlink('real/justfile', join(dir, 'justfile'))

    expect(await readBounded(dir, 'real/justfile')).toEqual({ text: 'build:\n  true\n' })
    expect(await readBounded(dir, 'justfile')).toEqual({ text: 'build:\n  true\n' })
  })

  test('skips a symlink that leaves the root, without opening its target', async () => {
    const dir = await root({})
    await symlink('/dev/zero', join(dir, 'justfile'))

    expect(await readBounded(dir, 'justfile')).toEqual({
      skipped: 'a symlink that leaves the repository',
    })
  })

  test('skips a directory and a pipe', async () => {
    const dir = await root({ 'sub/x': '' })
    runChecked(spawnRunner('mkfifo'), [join(dir, 'pipe')], { cwd: dir })

    expect(await readBounded(dir, 'sub')).toEqual({ skipped: 'not a regular file' })
    // Opening a pipe with no writer would block forever.
    expect(await readBounded(dir, 'pipe')).toEqual({ skipped: 'not a regular file' })
  })

  test('skips a file over the cap', async () => {
    const dir = await root({ small: 'abcd', big: 'abcdef' })

    expect(await readBounded(dir, 'small', 4)).toEqual({ text: 'abcd' })
    expect(await readBounded(dir, 'big', 4)).toEqual({ skipped: 'larger than 4 bytes' })
  })

  test('marks a missing file', async () => {
    const dir = await root({})
    expect(await readBounded(dir, 'nope')).toMatchObject({ missing: true })
  })
})

describe('reads through detection and the runners', () => {
  test('a justfile linked to /dev/zero gives no tasks and no hang', async () => {
    const dir = await root({})
    await symlink('/dev/zero', join(dir, 'justfile'))

    const catalog = await collect(dir, { discovery: 'walk', only: ['just'] })
    expect(tasks(catalog)).toEqual([])
  })

  test('an oversized manifest is reported as malformed, not read', async () => {
    const dir = await root({})
    await writeFile(join(dir, 'package.json'), ' '.repeat(MAX_READ_BYTES + 1))

    const profile = await createProject({ tools: builtins }).detect(dir, { discovery: 'walk' })
    expect(profile.malformed).toEqual([
      { path: 'package.json', error: `unreadable: larger than ${MAX_READ_BYTES} bytes` },
    ])
  })

  test('the fingerprint does not read a file outside the root', async () => {
    const dir = await root({})
    await symlink('/dev/zero', join(dir, 'justfile'))
    const files = createLister(dir, 'walk', fakeRunners([]).make('git'))

    const print = await fingerprint({ root: dir, paths: ['justfile'], patterns: [], files })
    expect(print.paths).toEqual(['justfile'])
  })
})

describe('walk caps', () => {
  test('the walk stops at the file cap and says so', async () => {
    const dir = await root({ a: '', b: '', c: '' })
    const list = createLister(dir, 'walk', fakeRunners([]).make('git'), [], true, {
      files: 2,
      depth: 32,
    })

    // In name order, so the same files are kept on every machine.
    expect(await list.all()).toEqual(['a', 'b'])
    expect(list.limit()).toEqual({ cap: 'files', value: 2 })
  })

  test('the walk does not enter a directory past the depth cap', async () => {
    const dir = await root({ 'a/b/c/deep': '', top: '' })
    const list = createLister(dir, 'walk', fakeRunners([]).make('git'), [], true, {
      files: 100,
      depth: 2,
    })

    expect((await list.all()).sort()).toEqual(['top'])
    expect(list.limit()).toEqual({ cap: 'depth', value: 2 })
  })

  test('no cap reached leaves the limit unset and the profile without a diagnostic', async () => {
    const dir = await root({ 'package.json': '{}' })
    const profile = await createProject({ tools: builtins }).detect(dir, { discovery: 'walk' })
    expect(profile.diagnostics).toEqual([])
  })

  test('detect turns a reached cap into a profile diagnostic', async () => {
    let path = ''
    for (let i = 0; i < 34; i++) path += `d${i}/`
    const dir = await root({})
    await mkdir(join(dir, path), { recursive: true })

    const profile = await createProject({ tools: builtins }).detect(dir, { discovery: 'walk' })
    expect(profile.diagnostics).toEqual([
      {
        severity: 'warning',
        message: 'the directory walk did not enter directories deeper than 32 levels',
      },
    ])
  })
})

describe('containment', () => {
  test('a symlinked parent directory that points out is not read', async () => {
    const outside = await root({ 'sub/justfile': 'SECRET' })
    const dir = await root({})
    await symlink(join(outside, 'sub'), join(dir, 'sub'))

    expect(await readBounded(dir, 'sub/justfile')).toEqual({
      skipped: 'a symlink that leaves the repository',
    })
  })

  test('a path with .. or an absolute path is not read', async () => {
    const outside = await root({ justfile: 'SECRET' })
    const dir = await root({ inner: '' })
    const rel = join('..', outside.split('/').pop()!, 'justfile')

    expect(await readBounded(dir, rel)).toEqual({ skipped: 'a path outside the repository' })
    expect(await readBounded(dir, join(outside, 'justfile'))).toEqual({
      skipped: 'a path outside the repository',
    })
  })

  test('readRegular refuses a pipe on the handle as well as the path', async () => {
    const dir = await root({})
    runChecked(spawnRunner('mkfifo'), [join(dir, 'pipe')], { cwd: dir })
    expect(await readRegular(join(dir, 'pipe'))).toEqual({ skipped: 'not a regular file' })
  })

  test('the fingerprint does not hash a file behind a symlinked parent', async () => {
    const outside = await root({ 'sub/justfile': 'one' })
    const dir = await root({})
    await symlink(join(outside, 'sub'), join(dir, 'sub'))
    const files = createLister(dir, 'walk', fakeRunners([]).make('git'))

    const before = await fingerprint({ root: dir, paths: ['sub/justfile'], patterns: [], files })
    await writeFile(join(outside, 'sub/justfile'), 'two')
    const after = await fingerprint({ root: dir, paths: ['sub/justfile'], patterns: [], files })
    expect(after.digest).toBe(before.digest)
  })
})
