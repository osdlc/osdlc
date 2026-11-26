/**
 * Public API delta by regex over exported declarations, with comments
 * stripped first; not type-aware.
 *
 * TypeScript and JavaScript: `export` declarations, `export { … }` lists,
 * `export * from` and `export default`, plus, when the `typescript` package
 * can be found, the public members of exported classes and interfaces as
 * `Class.member` with their signatures. Rust: `pub` items, `pub(crate)` and
 * the like excluded.
 *
 * A declaration changed when its first line differs with whitespace squashed;
 * a `const` is cut at its initializer, so a new value is not a change.
 * Overloads, and a getter beside its setter, share one entry holding every
 * signature. A change below a wrapped parameter list is not seen.
 */

import { basename, languageNamed } from '../scan/language.ts'
import { lexLines } from '../scan/lexer.ts'
import { isTsSource, parseSource, type TypeScript } from './typescript.ts'

export const API_LANGUAGES = ['ts', 'rust'] as const
export type ApiLanguage = (typeof API_LANGUAGES)[number]

/** name -> normalised signature */
export type ApiMap = Map<string, string>

const TS_ENTRY = /^index\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/

/** Which extractor reads this path, or null. Test files and `.d.ts` are never read. */
export function apiLanguage(path: string): ApiLanguage | null {
  if (path.endsWith('.rs')) return 'rust'
  if (isTsSource(path) && !/\.(?:test|spec)\./.test(path)) return 'ts'
  return null
}

/** True for a TypeScript or JavaScript package entry point (`index.ts`, `index.js` and the like). */
export function isEntryPoint(path: string): boolean {
  return TS_ENTRY.test(basename(path))
}

/** `Class.member` -> signature for public members of exported classes and interfaces. */
function tsMembers(ts: TypeScript | null, path: string, source: string): ApiMap {
  const out: ApiMap = new Map()
  if (ts === null || !/\bexport\b/.test(source)) return out
  const sf = parseSource(ts, path, source)
  for (const st of sf.statements) {
    if (!ts.isClassDeclaration(st) && !ts.isInterfaceDeclaration(st)) continue
    const mods = ts.canHaveModifiers(st) ? ts.getModifiers(st) : undefined
    if (!mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) || st.name === undefined)
      continue
    for (const m of st.members) {
      const name = m.name
      if (name === undefined || ts.isPrivateIdentifier(name)) continue
      const mm = ts.canHaveModifiers(m) ? ts.getModifiers(m) : undefined
      if (
        mm?.some(
          (x) =>
            x.kind === ts.SyntaxKind.PrivateKeyword || x.kind === ts.SyntaxKind.ProtectedKeyword,
        )
      ) {
        continue
      }
      const body =
        'body' in m && m.body !== undefined ? (m.body as import('typescript').Node) : null
      const init =
        'initializer' in m && m.initializer !== undefined
          ? (m.initializer as import('typescript').Node)
          : null
      const end = body?.getStart(sf) ?? init?.getStart(sf) ?? m.end
      add(
        out,
        `${st.name.text}.${name.getText(sf)}`,
        norm(source.slice(m.getStart(sf), end)).replace(/[;,]$/, ''),
      )
    }
  }
  return out
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

/**
 * Set `name`, or add `sig` to the signatures it holds, so overloads under one
 * name are all compared. They are kept sorted, one per line, so reordering a
 * getter and its setter (or merged declarations) is not a change.
 */
function add(map: ApiMap, name: string, sig: string): void {
  const prev = map.get(name)
  map.set(name, prev === undefined ? sig : [...prev.split('\n'), sig].sort().join('\n'))
}

const TS_DECL =
  /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(function\*?|class|interface|type|enum|const enum|const|let|var|namespace)\s+([A-Za-z0-9_$]+)(.*)$/
const TS_LIST = /export\s+(type\s+)?\{([^}]*)\}(?:\s*from\s*['"]([^'"]+)['"])?/g
const TS_STAR = /export\s+\*(?:\s+as\s+([A-Za-z0-9_$]+))?\s+from\s+['"]([^'"]+)['"]/g
/**
 * Qualifiers (`const fn`, `async`, `unsafe`, `extern "C"`) and `static mut` stay out of the key, so
 * the name is the item's own, but they are part of the signature, so adding or dropping one is a change.
 */
const RUST_DECL =
  /^\s*pub\s+((?:(?:const|async|unsafe|extern(?:\s+"[^"]*")?)\s+)*)(fn|struct|enum|trait|const|static|type|mod|union)\s+(mut\s+)?([A-Za-z0-9_]+)(.*)$/

/** A `pub use` statement, up to its `;`, across lines. `pub(crate) use` is not public. */
const RUST_USE = /(?:^|[;}\s])pub\s+use\s+([^;]+);/g

/** The items at the top level of a `{ … }` list, split at its commas. */
function topLevelItems(list: string): string[] {
  const items: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] === '{') depth += 1
    else if (list[i] === '}') depth -= 1
    else if (list[i] === ',' && depth === 0) {
      items.push(list.slice(start, i))
      start = i + 1
    }
  }
  items.push(list.slice(start))
  return items.map((i) => i.trim()).filter((i) => i !== '')
}

/**
 * The names a `use` tree re-exports, each with its full path: the last
 * segment or its `as` alias, `self` as the module's own name, and a glob as
 * `* from <path>`.
 */
function useTreeNames(tree: string, prefix: readonly string[] = []): [string, string][] {
  const open = tree.indexOf('{')
  if (open >= 0 && tree.endsWith('}')) {
    const head = tree.slice(0, open).split('::').filter(Boolean)
    return topLevelItems(tree.slice(open + 1, -1)).flatMap((item) =>
      useTreeNames(item, [...prefix, ...head]),
    )
  }
  const [path = '', alias] = tree.split(/\s+as\s+/)
  const segments = [...prefix, ...path.split('::').filter(Boolean)]
  const last = segments.at(-1)
  if (last === '*') return [[`* from ${segments.slice(0, -1).join('::')}`, segments.join('::')]]
  const own = last === 'self' ? segments.slice(0, -1) : segments
  const name = alias ?? own.at(-1) ?? ''
  const full = own.join('::') + (alias === undefined ? '' : ` as ${alias}`)
  return name === '' ? [] : [[name, full]]
}

const LEXED_AS: Record<ApiLanguage, string> = { ts: 'TypeScript', rust: 'Rust' }

/**
 * `source` with its comments removed, line for line, by the scanner's lexer,
 * which knows strings, regex literals and Rust lifetimes.
 */
function stripComments(language: ApiLanguage, source: string): string {
  const lexed = languageNamed(LEXED_AS[language])
  if (lexed === null) throw new Error(`${LEXED_AS[language]} is missing from the language table`)
  return lexLines(lexed, source.split('\n'))
    .map((f) => f.codeText)
    .join('\n')
}

/** `ts`, when given, adds the public members of exported classes and interfaces. */
export function extractApi(
  language: ApiLanguage,
  source: string,
  path: string,
  ts: TypeScript | null,
): ApiMap {
  const out: ApiMap = new Map()
  if (language === 'rust') {
    const stripped = stripComments('rust', source)
    for (const line of stripped.split('\n')) {
      const m = RUST_DECL.exec(line)
      if (m === null) continue
      const [, quals, kind, mut, name, tail] = m
      const rest = norm(tail!.split(/[{;]/)[0]!)
      // Two `impl` blocks may each have a `pub fn new`: every signature counts.
      add(out, `${kind} ${name}`, norm(`${quals}${kind} ${mut ?? ''}${name}${rest}`))
    }
    // A crate's public surface is mostly its re-exports.
    for (const m of stripped.matchAll(RUST_USE)) {
      for (const [name, full] of useTreeNames(m[1]!.replace(/\s+/g, ' ').trim())) {
        add(out, `use ${name}`, `pub use ${full.replace(/\s*::\s*/g, '::')}`)
      }
    }
    return out
  }
  // Strip comments first: doc text often quotes `export { … }`.
  const stripped = stripComments('ts', source)
  for (const line of stripped.split('\n')) {
    const m = TS_DECL.exec(line)
    if (m === null) continue
    const kind = m[1]!
    let rest = m[3]!
    // The initializer starts at the first `=` that is not the `=>` of a function type.
    if (kind === 'const' || kind === 'let' || kind === 'var') rest = rest.split(/=(?!>)/)[0]!
    else if (['class', 'interface', 'enum', 'namespace'].includes(kind)) rest = rest.split('{')[0]!
    add(out, m[2]!, norm(`${kind} ${m[2]}${rest}`))
  }
  for (const m of stripped.matchAll(TS_LIST)) {
    const from = m[3] ?? ''
    for (const item of m[2]!.split(',')) {
      const part = norm(item).replace(/^type\s+/, '')
      if (part === '') continue
      const exported = part.split(/\s+as\s+/).pop()!
      out.set(exported, norm(`${m[1] ?? ''}{ ${part} } ${from}`))
    }
  }
  for (const m of stripped.matchAll(TS_STAR)) {
    out.set(m[1] ?? `* from ${m[2]}`, `export * from ${m[2]}`)
  }
  if (/^export\s+default\b/m.test(stripped)) out.set('default', 'export default')
  for (const [k, v] of tsMembers(ts, path, source)) out.set(k, v)
  return out
}

export interface ApiDelta {
  added: string[]
  removed: string[]
  changed: string[]
}

export function diffApi(before: ApiMap, after: ApiMap): ApiDelta {
  const delta: ApiDelta = { added: [], removed: [], changed: [] }
  for (const [name, sig] of after) {
    const old = before.get(name)
    if (old === undefined) delta.added.push(name)
    else if (old !== sig) delta.changed.push(name)
  }
  for (const name of before.keys()) if (!after.has(name)) delta.removed.push(name)
  return delta
}
