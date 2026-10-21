/**
 * Build the {@link ProviderContext}: every file read and subprocess a provider
 * makes goes through here.
 *
 * Reads are memoized for one `detect()` call, so two providers reading one
 * `AGENTS.md` cost one read. In `project` mode every read outside the project
 * root answers "absent" without reading it, which is what makes that
 * mode's "never reads the home folder" a property of the context rather than a
 * promise each provider has to keep.
 *
 * Runtime-agnostic: `node:` APIs only.
 */

import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import type { AsyncCommandRunner } from '@osdlc/command-seam'

import type { DirEntry, JsonRead, ProviderContext, TextRead } from './contract.ts'
import { isInside } from './inside.ts'
import { asObject, errorMessage } from './json.ts'
import type { DetectMode } from './report.ts'

function safeRealpath(path: string): string | null {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

export interface ContextArgs {
  projectRoot: string
  home: string | null
  env: Readonly<Record<string, string | undefined>>
  platform: NodeJS.Platform
  systemRoot: string
  mode: DetectMode
  allowExec: boolean
  readContents: boolean
  includeValues: boolean
  which: (binary: string) => string | null
  makeRunner: (binary: string) => AsyncCommandRunner
  signal: AbortSignal
}

/** The shared context; {@link forHarness} gives each provider its own view. */
export function createContext(args: ContextArgs): ProviderContext {
  const { projectRoot, mode } = args
  const realRoot = safeRealpath(projectRoot) ?? projectRoot
  // In project mode a path must be inside the root by text and, when it exists,
  // by its real path too, so a symbolic link out of the project is not followed.
  const allowed = (path: string): boolean => {
    if (mode === 'full') return true
    const abs = resolve(path)
    if (!isInside(projectRoot, abs) && !isInside(realRoot, abs)) return false
    const real = safeRealpath(abs)
    return real === null || isInside(realRoot, real)
  }

  const texts = new Map<string, TextRead>()
  const readText = (path: string): TextRead => {
    const key = resolve(path)
    const hit = texts.get(key)
    if (hit) return hit
    let read: TextRead
    if (!allowed(key)) read = { status: 'absent' }
    else {
      try {
        read = { status: 'parsed', text: readFileSync(key, 'utf-8') }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        read =
          code === 'ENOENT' || code === 'ENOTDIR'
            ? { status: 'absent' }
            : { status: 'error', error: errorMessage(err) }
      }
    }
    texts.set(key, read)
    return read
  }

  const jsons = new Map<string, JsonRead>()
  const readJson = (path: string): JsonRead => {
    const key = resolve(path)
    const hit = jsons.get(key)
    if (hit) return hit
    const text = readText(key)
    let read: JsonRead
    if (text.status !== 'parsed') read = text
    else {
      try {
        const value = asObject(JSON.parse(text.text) as unknown)
        read = value ? { status: 'parsed', value } : { status: 'error', error: 'not a JSON object' }
      } catch (err) {
        read = { status: 'error', error: `not valid JSON (${errorMessage(err)})` }
      }
    }
    jsons.set(key, read)
    return read
  }

  const listDir = (path: string): DirEntry[] => {
    if (!allowed(path)) return []
    try {
      return readdirSync(path, { withFileTypes: true })
        .map((e) => {
          // Follow a symbolic link to learn what it points at; a dangling one is neither.
          let isFile = e.isFile()
          let isDirectory = e.isDirectory()
          if (e.isSymbolicLink()) {
            try {
              const st = statSync(resolve(path, e.name))
              isFile = st.isFile()
              isDirectory = st.isDirectory()
            } catch {
              /* dangling */
            }
          }
          return { name: e.name, isFile, isDirectory }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    } catch {
      return []
    }
  }

  return {
    harness: '',
    projectRoot,
    home: args.home,
    env: args.env,
    platform: args.platform,
    systemRoot: args.systemRoot,
    mode,
    allowExec: args.allowExec,
    readContents: args.readContents,
    includeValues: args.includeValues,
    readText,
    readJson,
    exists: (path) => allowed(path) && existsSync(path),
    isDirectory: (path) => {
      if (!allowed(path)) return false
      try {
        return statSync(path).isDirectory()
      } catch {
        return false
      }
    },
    listDir,
    realpath: (path) => (allowed(path) ? safeRealpath(path) : null),
    which: args.which,
    runner: (binary) => {
      if (!args.allowExec) throw new Error(`running ${binary} needs allowExec`)
      return args.makeRunner(binary)
    },
    signal: args.signal,
  }
}

/** `ctx` as one provider sees it. */
export function forHarness(ctx: ProviderContext, harness: string): ProviderContext {
  return { ...ctx, harness }
}
