import { vi } from 'vitest'

type FsPromises = typeof import('node:fs/promises')

// `vi.hoisted` runs before the `vi.mock` factory below, which `vi.mock` hoists
// above the imports. A hoisted binding cannot be exported directly, so `hook`
// re-exports it.
const hooks = vi.hoisted(() => ({
  /** Runs once, between the containment check and the real open. */
  beforeOpen: null as null | (() => Promise<void>),
  /** The handle the last `open` returned, so a test can check that it was closed. */
  lastHandle: null as null | Awaited<ReturnType<FsPromises['open']>>,
  /** Runs around the next `realpath` call only. */
  aroundNextRealpath: null as null | { before: () => Promise<void>; after: () => Promise<void> },
  /** When set, path-based `lstat` reports this inode, as when the path now resolves to another file. */
  lstatIno: null as number | null,
  /** When set, path-based `lstat` reports this device, as when the path now resolves onto another mount. */
  lstatDev: null as number | null,
}))

/**
 * One `node:fs/promises` mock for the test files that import this module. Each
 * hook is a pass-through until a test sets it. Import the module under test
 * after this one, so it loads the mock.
 */
export const hook = hooks

export function resetHooks(): void {
  hook.beforeOpen = null
  hook.lastHandle = null
  hook.aroundNextRealpath = null
  hook.lstatIno = null
  hook.lstatDev = null
}

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<FsPromises>()
  return {
    ...actual,
    open: async (...args: Parameters<FsPromises['open']>) => {
      const beforeOpen = hooks.beforeOpen
      hooks.beforeOpen = null
      await beforeOpen?.()
      hooks.lastHandle = await actual.open(...args)
      return hooks.lastHandle
    },
    realpath: async (...args: Parameters<FsPromises['realpath']>) => {
      const around = hooks.aroundNextRealpath
      hooks.aroundNextRealpath = null
      await around?.before()
      const resolved = await actual.realpath(...args)
      await around?.after()
      return resolved
    },
    lstat: async (path: string) => {
      const stats = await actual.lstat(path)
      if (hooks.lstatIno === null && hooks.lstatDev === null) return stats
      return {
        ...stats,
        ino: hooks.lstatIno ?? stats.ino,
        dev: hooks.lstatDev ?? stats.dev,
      }
    },
  }
})
