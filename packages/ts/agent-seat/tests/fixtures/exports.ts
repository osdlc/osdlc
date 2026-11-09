/**
 * The package's public exports and the identifiers its examples use, read with the TypeScript
 * compiler rather than regexes, so re-exports, aliases and TSDoc tags resolve the way `tsc` sees them.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

const pkg = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url))

/** One export of `src/index.ts`. */
export interface PublicExport {
  name: string
  /** Its declaration's TSDoc carries `@experimental`. */
  experimental: boolean
}

/** Every export of `src/index.ts`, following re-exports to the declaration that carries the TSDoc. */
export function publicExports(): PublicExport[] {
  const config = ts.getParsedCommandLineOfConfigFile(
    pkg('tsconfig.json'),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'))
      },
    },
  )
  if (config === undefined) throw new Error('tsconfig.json did not parse')
  const index = pkg('src/index.ts')
  const program = ts.createProgram([index], config.options)
  const checker = program.getTypeChecker()
  const source = program.getSourceFile(index)
  const module = source && checker.getSymbolAtLocation(source)
  if (module === undefined) throw new Error('src/index.ts has no module symbol')
  return checker.getExportsOfModule(module).map((symbol) => {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
    const experimental = (target.declarations ?? []).some((decl) =>
      ts.getJSDocTags(decl).some((tag) => tag.tagName.text === 'experimental'),
    )
    return { name: symbol.name, experimental }
  })
}

/** Identifiers used in `examples/*.test.ts`, outside import declarations, so an import alone does not count. */
export function exampleIdentifiers(): Set<string> {
  const dir = pkg('examples')
  const used = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) return
    if (ts.isIdentifier(node)) used.add(node.text)
    ts.forEachChild(node, visit)
  }
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.test.ts'))) {
    const path = `${dir}/${file}`
    visit(ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true))
  }
  return used
}
