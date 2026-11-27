/**
 * `@osdlc/code-stats/tree-sitter`: line scanners that read a real syntax tree,
 * for callers who install `web-tree-sitter` and the grammars they want
 * (`tree-sitter-typescript`, `tree-sitter-rust`, …). Pass the result's
 * `scanners` to `createScannerRegistry({ scanners })`; they read the files
 * they match in place of the table-driven built-ins, whose language names
 * reports keep.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { CodeStatsError } from '../error.ts'
import { resolvePeer } from '../peer.ts'
import type { LanguageScanner } from '../scan/registry.ts'
import { BUILTIN_GRAMMARS, type TreeSitterGrammar } from './grammars.ts'
import { treeSitterScanner } from './scanner.ts'

export { BUILTIN_GRAMMARS, type SyntaxNodeLike, type TreeSitterGrammar } from './grammars.ts'
export { treeSitterScanner } from './scanner.ts'

/** Options for {@link createTreeSitterScanners}. */
export interface TreeSitterOptions {
  /** The grammars to load. Default {@link BUILTIN_GRAMMARS}. */
  grammars?: readonly TreeSitterGrammar[]
  /** A directory holding grammars' `wasm.file`s, tried before the npm packages. */
  grammarsDir?: string
  /** Where `web-tree-sitter` and grammar packages are resolved from. Default the working directory. */
  resolveFrom?: string
}

/** What {@link createTreeSitterScanners} loaded, and what it could not. */
export interface TreeSitterScanners {
  scanners: LanguageScanner[]
  /** Grammars whose `.wasm` file could not be found, by id. */
  missing: string[]
  /** Grammars found but not loaded, such as a `.wasm` built for another runtime. */
  failed: { id: string; reason: string }[]
}

type WebTreeSitter = typeof import('web-tree-sitter')

/** `web-tree-sitter` from the caller's project, else beside this package. */
async function loadRuntime(from: string): Promise<WebTreeSitter> {
  const path = resolvePeer('web-tree-sitter', from)
  if (path === null) {
    throw new CodeStatsError('the web-tree-sitter package is not installed', { kind: 'bad-input' })
  }
  try {
    return (await import(path)) as WebTreeSitter
  } catch (e) {
    throw new CodeStatsError(`web-tree-sitter could not be loaded: ${String(e)}`, { cause: e })
  }
}

/** The grammar's `.wasm` file: in `grammarsDir`, else inside its npm package. */
function wasmPath(
  grammar: TreeSitterGrammar,
  options: TreeSitterOptions,
  from: string,
): string | null {
  if (options.grammarsDir !== undefined) {
    const file = join(options.grammarsDir, grammar.wasm.file)
    if (existsSync(file)) return file
  }
  const manifest = resolvePeer(`${grammar.wasm.package}/package.json`, from, (path) =>
    existsSync(join(dirname(path), grammar.wasm.file)),
  )
  return manifest === null ? null : join(dirname(manifest), grammar.wasm.file)
}

/**
 * Loads `web-tree-sitter` and every grammar it can find, and returns one
 * scanner per grammar loaded. A grammar that is missing or will not load is
 * listed, not an error; a runtime that is missing or will not load is a
 * {@link CodeStatsError}.
 */
export async function createTreeSitterScanners(
  options: TreeSitterOptions = {},
): Promise<TreeSitterScanners> {
  const from = options.resolveFrom ?? process.cwd()
  const { Language, Parser } = await loadRuntime(from)
  await Parser.init()
  const grammars = options.grammars ?? BUILTIN_GRAMMARS
  // Load concurrently, but list in the grammars' order: the registry tries
  // scanners in order (see ScannerRegistryOptions.scanners in scan/registry.ts).
  const loads = await Promise.allSettled(
    grammars.map(async (grammar) => {
      const path = wasmPath(grammar, options, from)
      return path === null ? null : Language.load(path)
    }),
  )
  const result: TreeSitterScanners = { scanners: [], missing: [], failed: [] }
  for (const [i, grammar] of grammars.entries()) {
    const load = loads[i]!
    if (load.status === 'fulfilled' && load.value === null) {
      result.missing.push(grammar.id)
      continue
    }
    try {
      if (load.status === 'rejected') throw load.reason
      const parser = new Parser()
      parser.setLanguage(load.value)
      result.scanners.push(treeSitterScanner(grammar, parser))
    } catch (e) {
      result.failed.push({ id: grammar.id, reason: e instanceof Error ? e.message : String(e) })
    }
  }
  return result
}
