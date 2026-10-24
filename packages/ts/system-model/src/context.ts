/**
 * Builds a `ProviderContext`: memoized `files()`, `readText()` and
 * `readJson()` over one root, shared by detection and the runners so a file
 * is listed and read once per call. `exists()` is not memoized.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { AsyncCommandRunner } from '@osdlc/command-seam'

import type { ProviderContext } from './contract.ts'
import { pathExists, type Lister } from './discovery.ts'
import type { DiscoveryMode } from './model.ts'

/** The listing and file caches behind one context, for one detect or one collect. */
export interface ContextState {
  lister: Lister
  textCache: Map<string, Promise<string | null>>
  jsonCache: Map<string, Promise<unknown>>
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
      hit = readFile(join(absRoot, relPath), 'utf-8').catch(() => null)
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
