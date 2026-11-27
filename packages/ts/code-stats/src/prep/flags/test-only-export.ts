/**
 * `test-only-export` (heuristic): a name this change adds to a module's
 * exports whose only importers in the checkout are test files. The export may
 * exist only so a test can reach an internal. A name is added when its
 * declaration sits on an added line and the module did not export it at the
 * base revision; overloads and merged declarations of one name are one export.
 *
 * Importers come from a scan of the top-level `import` and `export … from`
 * declarations of every TypeScript/JavaScript file that mentions the module's
 * file name, and of the `<script>` blocks of `.vue`, `.svelte` and `.astro`
 * files (an `.astro` file's `---` frontmatter too), resolving RELATIVE
 * specifiers only. A namespace import or
 * `export *` counts as importing every name. Limits, all of which can fool it:
 * a re-export through an index file counts as a non-test importer (so the
 * export is not flagged, though tests alone may use the index), a dynamic
 * `import()` or `require()` is not seen, a package-name import (`@scope/pkg`)
 * is not resolved, and a name used only inside its own file shows no importers
 * at all, which is not flagged. Barrel `index.*` files are skipped as public
 * entry points. Type-only exports are checked like any other. Only a module
 * code-stats puts in its `source` group is checked, and an importer is a test
 * file when code-stats would put it in its `tests` group (by its path).
 */

import { posix } from 'node:path'

import { parseSource } from '../../analysis/typescript.ts'

import { hasModifier, lineAt, type Node, type SourceFile } from '../ast.ts'
import type { FlagContext, RawFlag } from './context.ts'
import { groupOf } from '../checkout.ts'

const SCANNED = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|vue|svelte|astro)$/
const COMPONENT = /\.(?:vue|svelte|astro)$/

/** The script a component file holds: its `<script>` blocks and an `.astro` frontmatter, joined. */
function componentScript(path: string, text: string): string {
  const parts = [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!)
  if (path.endsWith('.astro')) {
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
    if (front !== null) parts.unshift(front[1]!)
  }
  return parts.join('\n')
}

interface Exported {
  name: string
  line: number
}

/** The exports declared at the top level of a module, with the line of each name. */
function exportsOf(cx: FlagContext, sf: SourceFile): Exported[] {
  const { ts } = cx
  const out: Exported[] = []
  const at = (n: Node): number => lineAt(sf, n.getStart(sf))
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st)) {
      if (st.moduleSpecifier !== undefined) continue
      if (st.exportClause !== undefined && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) out.push({ name: el.name.text, line: at(el) })
      }
    } else if (
      !hasModifier(ts, st, ts.SyntaxKind.ExportKeyword) ||
      hasModifier(ts, st, ts.SyntaxKind.DefaultKeyword)
    ) {
      continue
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) out.push({ name: d.name.text, line: at(d.name) })
      }
    } else if (
      (ts.isFunctionDeclaration(st) ||
        ts.isClassDeclaration(st) ||
        ts.isInterfaceDeclaration(st) ||
        ts.isTypeAliasDeclaration(st) ||
        ts.isEnumDeclaration(st)) &&
      st.name !== undefined
    ) {
      out.push({ name: st.name.text, line: at(st.name) })
    }
  }
  return out
}

/** Does the relative specifier `spec`, written in `importer`, name the module file `target`? */
export function resolvesTo(importer: string, spec: string, target: string): boolean {
  if (!spec.startsWith('.')) return false
  const strip = (p: string): string => p.replace(/\.(?:d\.)?(?:[cm]?[jt]sx?)$/, '')
  const want = posix.normalize(posix.join(posix.dirname(importer), spec))
  const have = strip(target)
  return strip(want) === have || posix.join(want, 'index') === have || want === have
}

/** Every module specifier in the top-level `import` and `export … from` declarations of a file, side-effect imports included. */
export function specifiersOf(cx: FlagContext, path: string, text: string): string[] {
  const { ts } = cx
  const out: string[] = []
  for (const st of parseSource(ts, path, text).statements) {
    if (
      (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) &&
      st.moduleSpecifier !== undefined &&
      ts.isStringLiteral(st.moduleSpecifier)
    ) {
      out.push(st.moduleSpecifier.text)
    }
  }
  return out
}

/** Names `file` takes from `target` through its top-level import/export-from declarations; `*` is all of them. */
function importedNames(cx: FlagContext, path: string, text: string, target: string): string[] {
  const { ts } = cx
  const names: string[] = []
  for (const st of parseSource(cx.ts, path, text).statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      if (!resolvesTo(path, st.moduleSpecifier.text, target)) continue
      const clause = st.importClause
      if (clause?.namedBindings === undefined) continue
      if (ts.isNamespaceImport(clause.namedBindings)) names.push('*')
      else
        for (const el of clause.namedBindings.elements)
          names.push((el.propertyName ?? el.name).text)
    } else if (
      ts.isExportDeclaration(st) &&
      st.moduleSpecifier !== undefined &&
      ts.isStringLiteral(st.moduleSpecifier) &&
      resolvesTo(path, st.moduleSpecifier.text, target)
    ) {
      const clause = st.exportClause
      if (clause !== undefined && ts.isNamedExports(clause)) {
        for (const el of clause.elements) names.push((el.propertyName ?? el.name).text)
      } else names.push('*')
    }
  }
  return names
}

export function testOnlyExports(cx: FlagContext): RawFlag[] {
  const out: RawFlag[] = []
  for (const file of cx.files) {
    if (file.group !== 'source' || posix.basename(file.path).startsWith('index.')) continue
    const text = cx.readHead(file.path)
    if (text === null) continue
    const baseText = cx.readBase(file.path)
    const existing = new Set(
      baseText === null
        ? []
        : exportsOf(cx, parseSource(cx.ts, file.path, baseText)).map((e) => e.name),
    )
    // The first declaration of each new name on an added line: an overload set is one export.
    const seen = new Set<string>()
    const added = exportsOf(cx, parseSource(cx.ts, file.path, text)).filter((e) => {
      if (seen.has(e.name)) return false
      seen.add(e.name)
      return file.added.has(e.line) && !existing.has(e.name)
    })
    if (added.length === 0) continue

    const stem = posix.basename(file.path).replace(/\.[^.]+$/, '')
    const importers = new Map<string, Set<string>>()
    for (const path of cx.checkout.files) {
      if (path === file.path || !SCANNED.test(path)) continue
      const read = cx.checkout.read(path)
      if (read === null || !read.includes(stem)) continue
      const src = COMPONENT.test(path) ? componentScript(path, read) : read
      for (const name of importedNames(cx, path, src, file.path)) {
        const set = importers.get(name) ?? new Set<string>()
        set.add(path)
        importers.set(name, set)
      }
    }
    for (const e of added) {
      const who = [
        ...new Set([...(importers.get(e.name) ?? []), ...(importers.get('*') ?? [])]),
      ].sort()
      if (who.length === 0 || !who.every((p) => groupOf(p) === 'tests')) continue
      out.push({
        kind: 'test-only-export',
        basis: 'heuristic',
        path: file.path,
        line: e.line,
        detail: `${e.name} is exported but only test files import it (${who.join(', ')})`,
        measurements: { name: e.name, importers: who },
      })
    }
  }
  return out
}
