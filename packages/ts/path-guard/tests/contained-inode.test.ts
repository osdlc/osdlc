import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { hook, resetHooks } from './fs-hooks.ts'

// After `fs-hooks.ts`, so the module under test loads the `node:fs/promises` mock.
const { readContainedFile } = await import('../contained.ts')

let root: string
let realContentDir: string

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'path-containment-inode-')))
  await mkdir(join(root, 'content'))
  await writeFile(join(root, 'content', 'note.md'), 'x')
  realContentDir = await realpath(join(root, 'content'))
})

afterEach(async () => {
  resetHooks()
  await rm(root, { recursive: true, force: true })
})

describe('readContainedFile inode check', () => {
  it('reads when the opened file is the file the path resolves to', async () => {
    const content = await readContainedFile(realContentDir, join(realContentDir, 'note.md'))
    expect(content?.toString()).toBe('x')
  })

  it('refuses when the path now resolves to a different file than the one opened', async () => {
    hook.lstatIno = 1
    await expect(
      readContainedFile(realContentDir, join(realContentDir, 'note.md')),
    ).resolves.toBeNull()
  })

  it('refuses when only the device differs and the inode is the same', async () => {
    hook.lstatDev = -1
    await expect(
      readContainedFile(realContentDir, join(realContentDir, 'note.md')),
    ).resolves.toBeNull()
  })

  it('throws when the file is missing', async () => {
    await expect(
      readContainedFile(realContentDir, join(realContentDir, 'missing.md')),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
