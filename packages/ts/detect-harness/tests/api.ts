/**
 * Reads the public surface with the TypeScript compiler API: the exports of
 * each entry point, whether each has TSDoc, and whether it is tagged
 * `@experimental`. Shared by the documentation tests and the example tests.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export const ENTRIES = {
  '.': 'src/index.ts',
  './locations': 'src/locations.ts',
  './model': 'src/model/index.ts',
} as const

export type EntryName = keyof typeof ENTRIES

export interface ExportInfo {
  name: string
  entry: EntryName
  documented: boolean
  experimental: boolean
}

function program(): ts.Program {
  const configPath = join(root, 'tsconfig.json')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
  return ts.createProgram(
    Object.values(ENTRIES).map((f) => join(root, f)),
    parsed.options,
  )
}

/** Every export of every entry point. */
export function publicExports(): ExportInfo[] {
  const prog = program()
  const checker = prog.getTypeChecker()
  const out: ExportInfo[] = []
  for (const [entry, file] of Object.entries(ENTRIES) as [EntryName, string][]) {
    const source = prog.getSourceFile(join(root, file))!
    const mod = checker.getSymbolAtLocation(source)!
    for (const exported of checker.getExportsOfModule(mod)) {
      const symbol =
        exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
      const docs = symbol.getDocumentationComment(checker)
      const tags = symbol.getJsDocTags(checker)
      out.push({
        name: exported.name,
        entry,
        documented: docs.some((d) => d.text.trim() !== ''),
        experimental: tags.some((t) => t.name === 'experimental'),
      })
    }
  }
  return out
}

/** The names in the README's "Experimental" section, one per backticked bullet. */
export function readmeExperimental(readme: string): string[] {
  const m = /^## Experimental\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(readme)
  if (!m) return []
  return [...m[1]!.matchAll(/^- `([^`]+)`/gm)].map((x) => x[1]!)
}

/** Names in one list and not the other. */
export function listDiff(
  tagged: readonly string[],
  listed: readonly string[],
): { untaggedButListed: string[]; taggedButNotListed: string[] } {
  const t = new Set(tagged)
  const l = new Set(listed)
  return {
    untaggedButListed: [...l].filter((n) => !t.has(n)).sort(),
    taggedButNotListed: [...t].filter((n) => !l.has(n)).sort(),
  }
}
