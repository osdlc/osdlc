import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { hook, resetHooks } from './fs-hooks.ts'

// After `fs-hooks.ts`, so the module under test loads the `node:fs/promises` mock.
const { existingPathInside, openContainedFile, readContainedFile, realPathInside } =
  await import('../contained.ts')

let root: string
let contentDir: string
let realContentDir: string

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'path-containment-')))
  contentDir = join(root, 'content')
  await mkdir(join(contentDir, 'sub'), { recursive: true })
  await writeFile(join(contentDir, 'sub', 'target.md'), 'x')
  await writeFile(join(root, 'outside.md'), 'x')
  await symlink(join(contentDir, 'sub', 'target.md'), join(contentDir, 'inside-link.md'))
  await symlink(join(root, 'outside.md'), join(contentDir, 'outside-link.md'))
  realContentDir = await realpath(contentDir)
})

afterEach(async () => {
  resetHooks()
  await rm(root, { recursive: true, force: true })
})

describe('realPathInside', () => {
  it('returns the resolved target of a symlink that stays inside', async () => {
    await expect(realPathInside(realContentDir, join(contentDir, 'inside-link.md'))).resolves.toBe(
      join(realContentDir, 'sub', 'target.md'),
    )
  })

  it('returns null for a symlink that points outside', async () => {
    await expect(
      realPathInside(realContentDir, join(contentDir, 'outside-link.md')),
    ).resolves.toBeNull()
  })
})

describe('existingPathInside', () => {
  it('returns the real path to read and the lexical relative path', async () => {
    await expect(
      existingPathInside(contentDir, realContentDir, join(contentDir, 'inside-link.md')),
    ).resolves.toEqual({
      realPath: join(realContentDir, 'sub', 'target.md'),
      relativePath: 'inside-link.md',
    })
  })

  it('returns null for a missing file', async () => {
    await expect(
      existingPathInside(contentDir, realContentDir, join(contentDir, 'missing.md')),
    ).resolves.toBeNull()
  })
})

describe('readContainedFile', () => {
  it('reads a file that is still inside', async () => {
    const content = await readContainedFile(
      realContentDir,
      join(realContentDir, 'sub', 'target.md'),
    )
    expect(content?.toString()).toBe('x')
  })

  it('reads a file through a symlink that stays inside', async () => {
    const content = await readContainedFile(realContentDir, join(contentDir, 'inside-link.md'))
    expect(content?.toString()).toBe('x')
  })

  it('refuses a symlink to a file outside without opening it', async () => {
    await expect(
      readContainedFile(realContentDir, join(contentDir, 'outside-link.md')),
    ).resolves.toBeNull()
  })

  it('refuses a file swapped for a symlink to outside after the check', async () => {
    const note = join(contentDir, 'sub', 'target.md')
    hook.beforeOpen = async () => {
      await rm(note)
      await symlink(join(root, 'outside.md'), note)
    }
    await expect(readContainedFile(realContentDir, note)).resolves.toBeNull()
    expect(hook.beforeOpen).toBeNull()
  })

  it('refuses a file swapped to outside, back before the re-resolve, and out again before the lstat', async () => {
    const note = join(contentDir, 'sub', 'target.md')
    const swapOut = async () => {
      await rm(note)
      await symlink(join(root, 'outside.md'), note)
    }
    hook.beforeOpen = async () => {
      await swapOut()
      hook.aroundNextRealpath = {
        before: async () => {
          await rm(note)
          await writeFile(note, 'x')
        },
        after: swapOut,
      }
    }
    await expect(readContainedFile(realContentDir, note)).resolves.toBeNull()
    expect(hook.beforeOpen).toBeNull()
    expect(hook.aroundNextRealpath).toBeNull()
  })

  it('refuses a parent directory swapped for a symlink to outside after the check', async () => {
    await mkdir(join(root, 'outdir'))
    await writeFile(join(root, 'outdir', 'target.md'), 'outside')
    hook.beforeOpen = async () => {
      await rename(join(contentDir, 'sub'), join(root, 'old-sub'))
      await symlink(join(root, 'outdir'), join(contentDir, 'sub'))
    }
    await expect(
      readContainedFile(realContentDir, join(contentDir, 'sub', 'target.md')),
    ).resolves.toBeNull()
    expect(hook.beforeOpen).toBeNull()
  })

  it('returns null for a directory inside the root', async () => {
    await expect(readContainedFile(realContentDir, join(contentDir, 'sub'))).resolves.toBeNull()
  })
})

describe('openContainedFile', () => {
  it('closes the handle and rethrows when the file vanishes after the open', async () => {
    const note = join(contentDir, 'sub', 'target.md')
    hook.beforeOpen = async () => {
      hook.aroundNextRealpath = {
        before: async () => {
          await rm(note)
        },
        after: async () => {},
      }
    }
    await expect(openContainedFile(realContentDir, note)).rejects.toMatchObject({ code: 'ENOENT' })
    // A closed handle reports fd -1.
    expect(hook.lastHandle?.fd).toBe(-1)
  })

  it('opens a symlink that stays inside the root, as the file it points to', async () => {
    const file = await openContainedFile(realContentDir, join(contentDir, 'inside-link.md'))
    if (file === null) throw new Error('expected a handle')
    try {
      expect(file.stats.isFile()).toBe(true)
      expect((await file.handle.readFile()).toString()).toBe('x')
    } finally {
      await file.handle.close()
    }
  })

  it('returns a handle for a directory, which the caller must refuse by its stats', async () => {
    const file = await openContainedFile(realContentDir, join(contentDir, 'sub'))
    if (file === null) throw new Error('expected a handle')
    try {
      expect(file.stats.isFile()).toBe(false)
      expect(file.stats.isDirectory()).toBe(true)
    } finally {
      await file.handle.close()
    }
  })

  it('refuses a FIFO inside the root without blocking', async () => {
    execFileSync('mkfifo', [join(contentDir, 'pipe')])
    await expect(readContainedFile(realContentDir, join(contentDir, 'pipe'))).resolves.toBeNull()
  })

  it('does not open an outside target, so a FIFO there cannot block', async () => {
    const fifo = join(root, 'outside.fifo')
    execFileSync('mkfifo', [fifo])
    await symlink(fifo, join(contentDir, 'fifo-link'))
    await expect(
      openContainedFile(realContentDir, join(contentDir, 'fifo-link')),
    ).resolves.toBeNull()
  })
})
