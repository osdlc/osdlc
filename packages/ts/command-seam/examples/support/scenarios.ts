/** The scenario files: every `NN-*.test.ts` in examples/, read from disk. */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import ts from 'typescript'

import { EXAMPLES_DIR, PACKAGE_DIR } from './typecheck.ts'

/** The package's `package.json`, the fields these tests read. */
export const MANIFEST = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf-8')) as {
  name: string
  exports: Record<string, { types: string; default: string }>
  files: string[]
}

export const PACKAGE_NAME = MANIFEST.name

/**
 * Each public entry point, from `package.json` `exports`: its import
 * specifier and its source file, the `types` target with `dist/` and `.d`
 * taken off (`./dist/testing.d.ts` is `testing.ts`).
 */
export const ENTRY_POINTS = Object.entries(MANIFEST.exports).map(([key, conditions]) => ({
  specifier: key === '.' ? PACKAGE_NAME : `${PACKAGE_NAME}${key.slice(1)}`,
  file: conditions.types.replace(/^\.\/dist\//, '').replace(/\.d\.ts$/, '.ts'),
}))

export interface Scenario {
  path: string
  source: string
}

export function scenarios(): Scenario[] {
  return readdirSync(EXAMPLES_DIR)
    .filter((f) => /^\d+-.*\.test\.ts$/.test(f))
    .sort()
    .map((f) => {
      const path = join(EXAMPLES_DIR, f)
      return { path, source: readFileSync(path, 'utf-8') }
    })
}

/** Every `import … from '<specifier>'` in `source`, with the names it binds. */
export function imports(source: string): { specifier: string; names: string[] }[] {
  const file = ts.createSourceFile('x.ts', source, ts.ScriptTarget.Latest)
  const out: { specifier: string; names: string[] }[] = []
  for (const stmt of file.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue
    const bindings = stmt.importClause?.namedBindings
    const names =
      bindings && ts.isNamedImports(bindings)
        ? bindings.elements.map((e) => (e.propertyName ?? e.name).text)
        : []
    out.push({ specifier: stmt.moduleSpecifier.text, names })
  }
  return out
}

export interface PublicExport {
  name: string
  /** Exported with `type`, so it must be imported with `type` too. */
  typeOnly: boolean
}

/**
 * The public names an entry file exports, values and types alike: named
 * re-exports (`export { a, type B } from …`) and exported declarations
 * (`export function a`).
 */
export function publicExports(entrySource: string): PublicExport[] {
  const file = ts.createSourceFile('entry.ts', entrySource, ts.ScriptTarget.Latest)
  const names: PublicExport[] = []
  for (const stmt of file.statements) {
    if (ts.isExportDeclaration(stmt)) {
      const clause = stmt.exportClause
      if (!clause || !ts.isNamedExports(clause)) {
        throw new Error('entry uses `export *`; list exports by name so coverage can see them')
      }
      for (const e of clause.elements) {
        names.push({ name: e.name.text, typeOnly: stmt.isTypeOnly || e.isTypeOnly })
      }
      continue
    }
    const exported =
      ts.canHaveModifiers(stmt) &&
      ts.getModifiers(stmt)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    if (!exported) continue
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) names.push({ name: d.name.text, typeOnly: false })
      }
    } else if (
      (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) &&
      stmt.name !== undefined
    ) {
      names.push({ name: stmt.name.text, typeOnly: false })
    } else if (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) {
      names.push({ name: stmt.name.text, typeOnly: true })
    }
  }
  // An overloaded function has one declaration per signature.
  return names.filter((n, i) => names.findIndex((m) => m.name === n.name) === i)
}
