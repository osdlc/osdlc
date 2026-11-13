import { join } from 'node:path'
import ts from 'typescript'

export const root = join(import.meta.dirname, '..')
const ENTRY_POINTS = ['src/index.ts', 'src/config/index.ts']

// Every export of both entry points whose TSDoc carries `@experimental`,
// followed through re-exports to the declaration.
export function experimentalExports(): Set<string> {
  const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
  // Following re-exports to their TSDoc needs only the package's own source,
  // not the standard library or @types: leaving those out makes the program
  // about six times cheaper to build, which matters when CI runs every
  // package's tests at once.
  const program = ts.createProgram(
    ENTRY_POINTS.map((e) => join(root, e)),
    { ...parsed.options, noLib: true, types: [], skipLibCheck: true },
  )
  const checker = program.getTypeChecker()
  const found = new Set<string>()
  for (const entry of ENTRY_POINTS) {
    const file = program.getSourceFile(join(root, entry))
    const module = file === undefined ? undefined : checker.getSymbolAtLocation(file)
    if (module === undefined) throw new Error(`cannot read ${entry}`)
    for (const symbol of checker.getExportsOfModule(module)) {
      const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
      if (target.getJsDocTags(checker).some((tag) => tag.name === 'experimental')) {
        found.add(symbol.name)
      }
    }
  }
  return found
}
