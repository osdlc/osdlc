import { describe, expect, test } from 'vitest'

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { checkoutRoot, discoverCheckouts, scanForCheckouts } from '../src/index.ts'

/** A throwaway `.git`-marked checkout, cleaned up via the returned dispose(). */
function makeCheckout(): { root: string; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'checkout-root-'))
  mkdirSync(join(root, '.git'))
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) }
}

describe('checkoutRoot', () => {
  test('a directory at the root resolves to itself', () => {
    const { root, dispose } = makeCheckout()
    try {
      expect(checkoutRoot(root)).toBe(root)
    } finally {
      dispose()
    }
  })

  test('a nested directory walks up to the .git marker', () => {
    const { root, dispose } = makeCheckout()
    try {
      const nested = join(root, 'src', 'deep')
      mkdirSync(nested, { recursive: true })
      expect(checkoutRoot(nested)).toBe(root)
    } finally {
      dispose()
    }
  })

  test('a FILE path starts the walk from its parent directory', () => {
    const { root, dispose } = makeCheckout()
    try {
      const nested = join(root, 'src')
      mkdirSync(nested, { recursive: true })
      const file = join(nested, 'thing.ts')
      writeFileSync(file, '')
      expect(checkoutRoot(file)).toBe(root)
    } finally {
      dispose()
    }
  })

  test('a path that does not exist yet is treated like a file (parent starts the walk)', () => {
    const { root, dispose } = makeCheckout()
    try {
      const notYetWritten = join(root, 'src', 'new-file.ts')
      expect(checkoutRoot(notYetWritten)).toBe(root)
    } finally {
      dispose()
    }
  })

  test("a linked worktree's .git FILE (not directory) still resolves", () => {
    const { root, dispose } = makeCheckout()
    try {
      const worktree = mkdtempSync(join(tmpdir(), 'checkout-root-wt-'))
      writeFileSync(join(worktree, '.git'), `gitdir: ${root}/.git/worktrees/wt\n`)
      expect(checkoutRoot(worktree)).toBe(worktree)
      rmSync(worktree, { recursive: true, force: true })
    } finally {
      dispose()
    }
  })

  test('no ancestor has a .git marker: returns null', () => {
    // Guards the guard: if the OS temp root itself sat under a `.git`
    // ancestor (a dotfiles repo at $HOME, say), this test would pass for
    // the wrong reason. Assert the precondition instead of assuming it.
    let above = resolve(tmpdir())
    for (;;) {
      expect(existsSync(join(above, '.git'))).toBe(false)
      const parent = dirname(above)
      if (parent === above) break
      above = parent
    }

    const outside = mkdtempSync(join(tmpdir(), 'checkout-root-none-'))
    try {
      expect(checkoutRoot(outside)).toBeNull()
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
})

describe('discoverCheckouts', () => {
  test('finds the checkouts below, sorted, and nothing else', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'typedgit-discover-'))
    try {
      for (const name of ['beta', 'alpha']) {
        mkdirSync(join(scratch, name, '.git'), { recursive: true })
      }
      // A plain directory, a dotted one, and a checkout inside an
      // organisational directory that is not itself a checkout.
      mkdirSync(join(scratch, 'plain'), { recursive: true })
      mkdirSync(join(scratch, '.hidden', '.git'), { recursive: true })
      mkdirSync(join(scratch, 'acme', 'inner', '.git'), { recursive: true })

      expect(discoverCheckouts(scratch)).toEqual([
        join(scratch, 'acme', 'inner'),
        join(scratch, 'alpha'),
        join(scratch, 'beta'),
      ])
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  test('stops at a checkout — nothing inside one is entered', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'typedgit-discover-prune-'))
    try {
      mkdirSync(join(scratch, 'repo', '.git'), { recursive: true })
      // A vendored checkout and a worktree parked inside the repository:
      // both carry a `.git`, and neither is a repository of this machine's.
      mkdirSync(join(scratch, 'repo', 'vendor', 'dep', '.git'), { recursive: true })
      mkdirSync(join(scratch, 'repo', 'worktrees', 'wt', '.git'), { recursive: true })

      expect(discoverCheckouts(scratch)).toEqual([join(scratch, 'repo')])
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  test('maxDepth bounds the descent — 1 is the direct children only', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'typedgit-discover-depth-'))
    try {
      mkdirSync(join(scratch, 'top', '.git'), { recursive: true })
      mkdirSync(join(scratch, 'a', 'b', 'c', 'deep', '.git'), { recursive: true })

      expect(discoverCheckouts(scratch, { maxDepth: 1 })).toEqual([join(scratch, 'top')])
      // The default stops short of it; a caller that knows its layout says so.
      expect(discoverCheckouts(scratch)).toEqual([join(scratch, 'top')])
      expect(discoverCheckouts(scratch, { maxDepth: 4 })).toEqual([
        join(scratch, 'a', 'b', 'c', 'deep'),
        join(scratch, 'top'),
      ])
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  test('a linked worktree answers like a checkout — .git is a file there', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'typedgit-discover-wt-'))
    try {
      mkdirSync(join(scratch, 'wt'), { recursive: true })
      writeFileSync(join(scratch, 'wt', '.git'), 'gitdir: /elsewhere/.git/worktrees/wt\n')
      expect(discoverCheckouts(scratch)).toEqual([join(scratch, 'wt')])
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  test('reports what the walk cost — directories read, directories left unopened', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'typedgit-discover-scan-'))
    try {
      mkdirSync(join(scratch, 'repo', '.git'), { recursive: true })
      mkdirSync(join(scratch, 'a', 'b', 'c'), { recursive: true })

      // Read: the root, `a`, `a/b`. Left unopened: `a/b/c`, one past the cap.
      // `repo` is a checkout, so it is a result rather than somewhere to go.
      const scan = scanForCheckouts(scratch, { maxDepth: 3 })
      expect(scan.checkouts).toEqual([join(scratch, 'repo')])
      expect(scan.directoriesScanned).toBe(3)
      expect(scan.depthLimited).toBe(1)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  test('says so, once, when the tree is enormous', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'typedgit-discover-warn-'))
    try {
      mkdirSync(join(scratch, 'a', 'b'), { recursive: true })
      const warnings: string[] = []

      const scan = scanForCheckouts(scratch, {
        warnAfter: 1,
        onWarn: (message) => warnings.push(message),
      })

      expect(scan.directoriesScanned).toBe(3)
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain(scratch)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  test('an unreadable directory is an empty answer, not a throw', () => {
    expect(discoverCheckouts(join(tmpdir(), 'typedgit-does-not-exist-xyz'))).toEqual([])
  })
})
