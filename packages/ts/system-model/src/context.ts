/**
 * Builds a `ProviderContext`: memoized `files()`, `readText()` and
 * `readJson()` over one root, shared by detection and the runners so a file
 * is listed and read once per call. `exists()` is not memoized.
 */

import { withDefaults, type AsyncCommandRunner } from '@osdlc/command-seam'

import type { ProviderContext } from './contract.ts'
import { pathExists, type Lister } from './discovery.ts'
import type { DiscoveryMode } from './model.ts'
import { readBounded } from './read.ts'

/** The listing and file caches behind one context, for one detect or one collect. */
export interface ContextState {
  lister: Lister
  textCache: Map<string, Promise<string | null>>
  jsonCache: Map<string, Promise<unknown>>
}

/**
 * The timeout of a probe whose runner declares none, and of every subprocess
 * detection starts: 60 s.
 */
export const DEFAULT_PROBE_TIMEOUT_MS = 60_000

/** The timeout of each discovery git call: 30 s. */
export const GIT_TIMEOUT_MS = 30_000

/**
 * `makeRunner` with `signal` and `timeoutMs` bound to every call. A call's own
 * `signal` or `timeoutMs` replaces the bound one.
 */
export function boundRunners(
  makeRunner: (binary: string) => AsyncCommandRunner,
  signal: AbortSignal,
  timeoutMs: number,
): (binary: string) => AsyncCommandRunner {
  return (binary) => withDefaults(makeRunner(binary), { signal, timeoutMs })
}

export function createContextState(lister: Lister): ContextState {
  return { lister, textCache: new Map(), jsonCache: new Map() }
}

export function createContext(args: {
  absRoot: string
  allowExec: boolean
  makeRunner: (binary: string) => AsyncCommandRunner
  which: (binary: string) => string | null
  signal: AbortSignal
  discovery: DiscoveryMode
  state: ContextState
}): ProviderContext {
  const { absRoot, allowExec, makeRunner, which, signal, discovery, state } = args

  const readText = (relPath: string): Promise<string | null> => {
    let hit = state.textCache.get(relPath)
    if (hit === undefined) {
      hit = readBounded(absRoot, relPath).then((read) => ('text' in read ? read.text : null))
      state.textCache.set(relPath, hit)
    }
    return hit
  }

  const readJson = (relPath: string): Promise<unknown> => {
    let hit = state.jsonCache.get(relPath)
    if (hit === undefined) {
      hit = readText(relPath).then((text) => (text === null ? null : safeParse(text)))
      state.jsonCache.set(relPath, hit)
    }
    return hit
  }

  return {
    root: absRoot,
    runner: makeRunner,
    files: state.lister,
    readJson,
    readText,
    exists: (relPath) => pathExists(absRoot, relPath),
    which,
    allowExec,
    discovery,
    signal,
  }
}

/** Returns `null` rather than throwing: a malformed file is a diagnostic, not a crash. */
function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
