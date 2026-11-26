import { createRequire } from 'node:module'
import { extname } from 'node:path'

import type { SourceFile } from 'typescript'

import { resolvePeer } from '../peer.ts'

/** The `typescript` compiler API module, an optional peer dependency. */
export type TypeScript = typeof import('typescript')

const TS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'] as const

/** A TypeScript or JavaScript source file; declaration files (`.d.ts`, `.d.mts`, `.d.cts`) are not. */
export function isTsSource(path: string): boolean {
  return TS_EXTENSIONS.some((e) => path.endsWith(e)) && !/\.d\.[mc]?ts$/.test(path)
}

/** The last two parses, kept only while {@link withParseMemo} runs. */
let recent: { ts: TypeScript; path: string; text: string; file: SourceFile }[] | null = null

/**
 * Runs `run` with the last two parses kept, so the API and complexity passes,
 * which each read both sides of a file, parse each side once. They are let
 * go when `run` returns, so a long-lived caller does not hold a syntax tree.
 */
export function withParseMemo<T>(run: () => T): T {
  const outer = recent
  recent ??= []
  try {
    return run()
  } finally {
    recent = outer
  }
}

/**
 * `text` parsed as the kind of source `path` names, with parent links;
 * inside {@link withParseMemo}, a recent parse of the same text is reused.
 */
export function parseSource(ts: TypeScript, path: string, text: string): SourceFile {
  const hit = recent?.find((r) => r.ts === ts && r.path === path && r.text === text)
  if (hit !== undefined) return hit.file
  const ext = extname(path)
  const kind =
    ext === '.tsx'
      ? ts.ScriptKind.TSX
      : ext === '.jsx'
        ? ts.ScriptKind.JSX
        : ext === '.ts' || ext === '.mts' || ext === '.cts'
          ? ts.ScriptKind.TS
          : ts.ScriptKind.JS
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind)
  if (recent !== null) {
    recent.unshift({ ts, path, text, file })
    recent.length = Math.min(recent.length, 2)
  }
  return file
}

/** TypeScript 7's native build ships no JS compiler API. */
function hasCompilerApi(mod: unknown): mod is TypeScript {
  const m = mod as Partial<TypeScript> | null
  return m != null && typeof m.createSourceFile === 'function' && m.ScriptKind !== undefined
}

const require = createRequire(import.meta.url)
const cache = new Map<string, TypeScript | null>()

/**
 * The `typescript` compiler API, an optional peer: the copy the project at
 * `root` resolves, else the one beside this package. Null when neither is
 * there or neither has the JS API. Loading it runs that project's copy.
 */
export function loadTypeScript(root: string): TypeScript | null {
  const cached = cache.get(root)
  if (cached !== undefined) return cached
  const path = resolvePeer('typescript', root, (p) => hasCompilerApi(require(p)))
  const found = path === null ? null : (require(path) as TypeScript)
  cache.set(root, found)
  return found
}

/**
 * A `typescript` loaded only when first needed. `found()` says whether there
 * is one: once loaded, whether it loaded with the compiler API; before, only
 * whether one resolves, which loads nothing. `load()` loads it, once.
 */
export interface TypeScriptSource {
  found(): boolean
  load(): TypeScript | null
}

/** The {@link loadTypeScript} of `root`, loaded when first asked for. */
export function typeScriptAt(root: string): TypeScriptSource {
  let resolves: boolean | undefined
  return {
    found: () =>
      cache.has(root)
        ? cache.get(root) !== null
        : (resolves ??= resolvePeer('typescript', root) !== null),
    load: () => loadTypeScript(root),
  }
}

function isSource(ts: TypeScript | TypeScriptSource): ts is TypeScriptSource {
  const s = ts as Partial<TypeScriptSource>
  return typeof s.found === 'function' && typeof s.load === 'function'
}

/** `ts` as a {@link TypeScriptSource}: a source as it is, a module or null as one that holds it. */
export function typeScriptSource(ts: TypeScript | TypeScriptSource | null): TypeScriptSource {
  if (ts !== null && isSource(ts)) return ts
  return { found: () => ts !== null, load: () => ts }
}
