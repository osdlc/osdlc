import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { unquoteCPath } from '../diff/parse.ts'
import { compileGlobs } from '../glob.ts'
import { isLinguistAttribute, LINGUIST_ATTRIBUTES, linguistValue } from '../linguist.ts'
import type { LinguistAttributes } from '../types.ts'
import { gitDirOf } from './walk.ts'

/** An attribute and its state as `git check-attr` would print it. */
type Token = [name: string, state: string]

/** `[attr]` macro names and the tokens each stands for. */
type Macros = ReadonlyMap<string, readonly Token[]>

interface Rule {
  /** Whether the rule applies to `path`, relative to its `.gitattributes` directory. */
  matches(path: string): boolean
  /** The linguist attributes and macros the line names, in line order. */
  tokens: Token[]
}

/** A token's state as `git check-attr` would print it: `name`, `-name`, `!name`, `name=value`. */
function tokenState(token: string): Token {
  if (token.startsWith('-')) return [token.slice(1), 'unset']
  if (token.startsWith('!')) return [token.slice(1), 'unspecified']
  const eq = token.indexOf('=')
  return eq < 0 ? [token, 'set'] : [token.slice(0, eq), token.slice(eq + 1)]
}

const tokensOf = (text: string): Token[] =>
  text
    .trim()
    .split(/\s+/)
    .filter((t) => t !== '')
    .map(tokenState)

/** The lines of a `.gitattributes`, blank and comment lines left out. */
const linesOf = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((raw) => raw.trimStart())
    .filter((line) => line !== '' && !line.startsWith('#'))

/** `[attr]name tokens…`, with a name git accepts. */
const MACRO_LINE = /^\[attr\]([\w.][\w.-]*)(?:\s(.*))?$/

/** Adds the macros `text` defines to `macros`, a later definition replacing an earlier one. */
function addMacros(macros: Map<string, Token[]>, text: string): void {
  for (const line of linesOf(text)) {
    const m = MACRO_LINE.exec(line)
    if (m !== null) macros.set(m[1]!, tokensOf(m[2] ?? ''))
  }
}

/** A line's pattern and the rest of the line, a C-quoted pattern unquoted. */
function splitLine(line: string): [pattern: string, rest: string] {
  if (line.startsWith('"')) {
    const close = /^"(?:[^"\\]|\\.)*"/.exec(line)
    if (close !== null) return [unquoteCPath(close[0]), line.slice(close[0].length)]
  }
  const space = line.search(/\s/)
  return space < 0 ? [line, ''] : [line.slice(0, space), line.slice(space)]
}

/**
 * Git's attribute matching, compiled once: a pattern with no `/` matches a
 * file's name at any depth; one with a `/` (a leading one dropped) matches
 * the path from the `.gitattributes` directory. Wildcards read as git's do:
 * `*` and `?` stop at `/` and match a leading dot, `**` spans directories,
 * and braces and extglobs are literal. Null for a pattern git never matches
 * to a file: a negated one, or one ending in `/`, which names a directory.
 */
function compile(pattern: string): ((path: string) => boolean) | null {
  if (pattern.startsWith('!') || pattern.endsWith('/')) return null
  const anchored = pattern.includes('/')
  const isMatch = compileGlobs([anchored ? pattern.replace(/^\//, '') : pattern], {
    dot: true,
    nobrace: true,
    noextglob: true,
    posix: true,
  })
  if (anchored) return isMatch
  return (path) => isMatch(path.slice(path.lastIndexOf('/') + 1))
}

/** The lines of a `.gitattributes` that name a linguist attribute or one of `macros`. */
function parseRules(text: string, macros: Macros): Rule[] {
  const rules: Rule[] = []
  for (const line of linesOf(text)) {
    // `[attr]` lines set nothing here: macros come from the top file and info/attributes alone.
    if (line.startsWith('[attr]')) continue
    const [pattern, rest] = splitLine(line)
    const tokens = tokensOf(rest).filter(([name]) => isLinguistAttribute(name) || macros.has(name))
    if (tokens.length === 0) continue
    const matches = compile(pattern)
    if (matches !== null) rules.push({ matches, tokens })
  }
  return rules
}

/**
 * Gives `token` its state unless a stronger line already did, as git does:
 * the strongest line is read first, a line from its last token back, and
 * each attribute keeps the first state it gets. A macro that gets set
 * expands there into its tokens, which fill only what is still unknown.
 */
function fill(known: Map<string, string>, macros: Macros, [name, state]: Token): void {
  if (known.has(name)) return
  known.set(name, state)
  const expansion = state === 'set' ? macros.get(name) : undefined
  if (expansion !== undefined) fillAll(known, macros, expansion)
}

function fillAll(known: Map<string, string>, macros: Macros, tokens: readonly Token[]): void {
  for (let i = tokens.length - 1; i >= 0; i -= 1) fill(known, macros, tokens[i]!)
}

/**
 * The linguist attributes of `files`, from the `.gitattributes` texts
 * `attributesFile` returns for each directory (`''` for the top; null where
 * there is none) and the git directory's `info/attributes` text, matched and
 * ordered as git does: every directory from the top down to the file's own,
 * a later line or a deeper file winning, `info/attributes` over them all.
 * `[attr]` macros from the top `.gitattributes` and `info/attributes` are
 * expanded; git ignores macros defined deeper. The system and user attributes
 * files are not read: they apply to every repository on the machine.
 */
export function linguistAttributesFrom(
  files: readonly string[],
  attributesFile: (dir: string) => string | null,
  infoText: string,
): Map<string, LinguistAttributes> {
  const topText = attributesFile('') ?? ''
  const macros = new Map<string, Token[]>()
  addMacros(macros, topText)
  addMacros(macros, infoText)
  const cache = new Map<string, Rule[]>([['', parseRules(topText, macros)]])
  const rulesIn = (dir: string): Rule[] => {
    let rules = cache.get(dir)
    if (rules === undefined) {
      rules = parseRules(attributesFile(dir) ?? '', macros)
      cache.set(dir, rules)
    }
    return rules
  }
  const info = parseRules(infoText, macros)
  const out = new Map<string, LinguistAttributes>()
  for (const file of files) {
    const known = new Map<string, string>()
    const apply = (rules: readonly Rule[], path: string) => {
      for (let i = rules.length - 1; i >= 0; i -= 1) {
        const rule = rules[i]!
        if (rule.matches(path)) fillAll(known, macros, rule.tokens)
      }
    }
    apply(info, file)
    const parts = file.split('/')
    for (let depth = parts.length - 1; depth >= 0; depth -= 1) {
      apply(rulesIn(parts.slice(0, depth).join('/')), parts.slice(depth).join('/'))
    }
    const attributes: LinguistAttributes = {}
    for (const [name, key] of Object.entries(LINGUIST_ATTRIBUTES)) {
      const state = known.get(name)
      const value = state === undefined ? undefined : linguistValue(state)
      if (value !== undefined) attributes[key] = value
    }
    if (Object.keys(attributes).length > 0) out.set(file, attributes)
  }
  return out
}

/** The directories whose `.gitattributes` can apply to `files`: every ancestor, `''` for the top. */
export function attributeDirs(files: readonly string[]): string[] {
  const dirs = new Set<string>([''])
  for (const file of files) {
    const parts = file.split('/')
    for (let depth = 1; depth < parts.length; depth += 1) dirs.add(parts.slice(0, depth).join('/'))
  }
  return [...dirs]
}

/** The git directory's `info/attributes` under `root`, or `''`. */
export function infoAttributes(root: string): string {
  const gitDir = gitDirOf(root)
  try {
    return gitDir === null ? '' : readFileSync(join(gitDir, 'info', 'attributes'), 'utf8')
  } catch {
    return ''
  }
}

/**
 * The linguist attributes of `files` (paths relative to `root`), read from
 * the `.gitattributes` files on disk and the git directory's
 * `info/attributes`, as {@link linguistAttributesFrom} applies them.
 */
export function readLinguistAttributes(
  root: string,
  files: readonly string[],
): Map<string, LinguistAttributes> {
  const onDisk = (dir: string): string | null => {
    try {
      return readFileSync(join(root, dir, '.gitattributes'), 'utf8')
    } catch {
      return null
    }
  }
  return linguistAttributesFrom(files, onDisk, infoAttributes(root))
}
