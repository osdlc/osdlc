/**
 * Cyclomatic complexity per function, behind a small analyzer interface so the
 * heavy part is optional.
 *
 * - `createTypescriptAnalyzer` (TS/JS) walks the TypeScript compiler AST; it
 *   needs the optional `typescript` peer and reports itself unavailable
 *   without it.
 * - `createLizardAnalyzer` (Rust, Python, Go, Java, C, …) runs `lizard --csv`
 *   when `lizard` is on PATH.
 *
 * Complexity = 1 + decision points: `if`, `for`, `for-in`, `for-of`, `while`,
 * `do`, non-default `case`, `catch`, `?:`, `&&`, `||`, `??`. A nested function
 * is its own entry and does not add to its parent. Optional chaining and
 * early returns are not counted. A signature with no body (an overload,
 * `declare`, `abstract`) is not an entry. This is McCabe's metric as most linters
 * compute it, not a cognitive-complexity score.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'

import {
  firstLine,
  runFailed,
  spawnRunner,
  stderrOrError,
  type CommandRunner,
} from '@osdlc/command-seam'

import {
  isTsSource,
  parseSource,
  typeScriptSource,
  type TypeScript,
  type TypeScriptSource,
} from './typescript.ts'

/** function name -> cyclomatic complexity */
export type FunctionComplexity = Map<string, number>

/** A complexity analyzer, shaped like a `LanguageScanner`. */
export interface Analyzer {
  readonly id: string
  /** Whether it can run at all: a binary on PATH, a module installed. */
  available(): boolean
  matches(path: string): boolean
  /** Throws when it cannot score the text, so the file is noted as skipped rather than read as empty. */
  analyze(text: string, path: string): FunctionComplexity
  /**
   * Scores many texts in one call, in their order, as {@link analyze} scores
   * each. When it is there, the diff report calls it in place of `analyze`.
   * Throws when it cannot score them.
   */
  analyzeAll?(sources: readonly AnalyzerSource[], options?: AnalyzeAllOptions): FunctionComplexity[]
}

/** Options for {@link Analyzer.analyzeAll}. */
export interface AnalyzeAllOptions {
  /** The longest an {@link Analyzer.analyzeAll} call may take, in ms; past it the call throws. */
  timeoutMs?: number
}

/** A text to score and the path that names its language. */
export interface AnalyzerSource {
  text: string
  path: string
}

function uniqueName(map: FunctionComplexity, name: string): string {
  if (!map.has(name)) return name
  let n = 2
  while (map.has(`${name}#${n}`)) n += 1
  return `${name}#${n}`
}

/**
 * Exact cyclomatic complexity for TypeScript and JavaScript, over `ts`'s
 * syntax tree. A {@link TypeScriptSource} is loaded the first time a file is
 * analyzed.
 *
 * @experimental
 */
export function createTypescriptAnalyzer(ts: TypeScript | TypeScriptSource | null): Analyzer {
  const source = typeScriptSource(ts)
  return {
    id: 'typescript',
    available: () => source.found(),
    matches: isTsSource,
    analyze: (text, path) => {
      const loaded = source.load()
      return loaded === null ? new Map() : typescriptComplexity(loaded, text, path)
    },
  }
}

function typescriptComplexity(ts: TypeScript, source: string, path: string): FunctionComplexity {
  const out: FunctionComplexity = new Map()
  const sf = parseSource(ts, path, source)
  const K = ts.SyntaxKind

  const nameOf = (n: import('typescript').Node | undefined): string | null =>
    n !== undefined && (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isPrivateIdentifier(n))
      ? n.text
      : null

  // `scope` is the dotted name of the nearest NAMED enclosing function or
  // class; an unnamed function is `<scope>.<anonymous k>` with k counted per
  // scope, and its own children keep the same scope, so a callback inside a
  // callback is still named after the function they both sit in.
  const anon = new Map<string, number>()
  function fnName(
    node: import('typescript').Node,
    scope: string,
  ): { full: string; named: boolean } {
    let own: string | null = null
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) own = nameOf(node.name)
    else if (ts.isGetAccessorDeclaration(node)) own = `get ${nameOf(node.name) ?? '?'}`
    else if (ts.isSetAccessorDeclaration(node)) own = `set ${nameOf(node.name) ?? '?'}`
    else if (ts.isConstructorDeclaration(node)) own = 'constructor'
    else {
      const p = node.parent
      if (p !== undefined) {
        if (ts.isVariableDeclaration(p)) own = nameOf(p.name)
        else if (ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) own = nameOf(p.name)
      }
    }
    if (own === null) {
      const n = (anon.get(scope) ?? 0) + 1
      anon.set(scope, n)
      const label = `<anonymous ${n}>`
      return { full: scope === '' ? label : `${scope}.${label}`, named: false }
    }
    return { full: scope === '' ? own : `${scope}.${own}`, named: true }
  }

  function walk(node: import('typescript').Node, scope: string, acc: { cc: number } | null) {
    const fnLike =
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)
    if (fnLike) {
      // An overload signature, `declare function` or abstract method has no body to score.
      if (node.body === undefined) return
      const { full, named } = fnName(node, scope)
      const mine = { cc: 1 }
      ts.forEachChild(node, (c) => walk(c, named ? full : scope, mine))
      out.set(uniqueName(out, full), mine.cc)
      return
    }
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      // An unnamed class expression takes the name it is assigned to, as a function value does.
      const p = node.parent
      const assigned =
        p !== undefined &&
        (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p))
          ? nameOf(p.name)
          : null
      const cls = nameOf(node.name) ?? assigned ?? `<class>`
      const next = scope === '' ? cls : `${scope}.${cls}`
      ts.forEachChild(node, (c) => walk(c, next, null))
      return
    }
    if (acc !== null) {
      switch (node.kind) {
        case K.IfStatement:
        case K.ForStatement:
        case K.ForInStatement:
        case K.ForOfStatement:
        case K.WhileStatement:
        case K.DoStatement:
        case K.CaseClause:
        case K.CatchClause:
        case K.ConditionalExpression:
          acc.cc += 1
          break
        case K.BinaryExpression: {
          const op = (node as import('typescript').BinaryExpression).operatorToken.kind
          if (
            op === K.AmpersandAmpersandToken ||
            op === K.BarBarToken ||
            op === K.QuestionQuestionToken
          ) {
            acc.cc += 1
          }
          break
        }
      }
    }
    ts.forEachChild(node, (c) => walk(c, scope, acc))
  }
  walk(sf, '', null)
  return out
}

/** The files this analyzer hands to lizard, by extension. */
const LIZARD_EXTENSIONS = [
  '.rs',
  '.py',
  '.go',
  '.java',
  '.kt',
  '.swift',
  '.c',
  '.h',
  '.cc',
  '.cpp',
  '.hpp',
  '.cs',
  '.php',
  '.rb',
  '.scala',
] as const

/** Split one CSV line, honouring double quotes. */
function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i += 1
      } else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

/**
 * `lizard --csv` rows: NLOC,CCN,token,PARAM,length,location,file,function,long_name,start,end.
 * A function is keyed by its long name without the parameter list, which keeps
 * the class or namespace lizard puts there (`Foo::new`), so same-named
 * functions of different types stay apart when one is added or moved. The
 * parameters are left out so that changing them keeps the function's key. A
 * long name that, with its parameter list cut, is neither the function column
 * nor ends in `::` and it, as Rust's, Kotlin's and Swift's (`f x : i32`) are,
 * gives way to the function column.
 */
export function parseLizardCsv(csv: string): FunctionComplexity {
  return parseLizardCsvByFile(csv, () => '').get('') ?? new Map()
}

/** {@link parseLizardCsv} of each file's rows, keyed by the file column, or by `key` of it. */
function parseLizardCsvByFile(
  csv: string,
  key: (file: string) => string = (file) => file,
): Map<string, FunctionComplexity> {
  const files = new Map<string, FunctionComplexity>()
  for (const line of csv.split('\n')) {
    if (line.trim() === '') continue
    const cols = splitCsv(line)
    const ccn = Number(cols[1])
    const fn = cols[7] ?? ''
    const cut = (cols[8] ?? '').replace(/\s*\(.*$/s, '').trim()
    const name = cut === fn || cut.endsWith(`::${fn}`) ? cut : fn
    if (!Number.isFinite(ccn) || name === '') continue
    const file = key(cols[6]!)
    let out = files.get(file)
    if (out === undefined) files.set(file, (out = new Map()))
    out.set(uniqueName(out, name), ccn)
  }
  return files
}

const lizardTimeoutMs = (files: number): number => 60_000 + 1_000 * files

/**
 * Complexity for the languages lizard reads, through `lizard --csv` when it
 * is on PATH. {@link Analyzer.analyzeAll} writes every text to one temporary
 * directory and reads them with one lizard process, which has `timeoutMs`,
 * else {@link lizardTimeoutMs}, to finish.
 *
 * @experimental
 */
export function createLizardAnalyzer(runner: CommandRunner = spawnRunner('lizard')): Analyzer {
  let ok: boolean | undefined
  const analyzeAll = (
    sources: readonly AnalyzerSource[],
    options: AnalyzeAllOptions = {},
  ): FunctionComplexity[] => {
    if (sources.length === 0) return []
    const dir = mkdtempSync(join(tmpdir(), 'code-stats-lizard-'))
    try {
      const files = sources.map((s, i) => {
        const file = `${i}${extname(s.path)}`
        writeFileSync(join(dir, file), s.text)
        return file
      })
      const r = runner.run(['--csv', ...files], {
        cwd: dir,
        timeoutMs: options.timeoutMs ?? lizardTimeoutMs(files.length),
      })
      // An empty map would read as every function added or removed; the caller notes the files.
      if (runFailed(r))
        throw new Error(`lizard failed: ${firstLine(stderrOrError(r), `exit ${r.exitCode}`)}`)
      const byFile = parseLizardCsvByFile(r.stdout)
      return files.map((file) => byFile.get(file) ?? new Map())
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  return {
    id: 'lizard',
    available() {
      if (ok === undefined) {
        try {
          ok = runner.run(['--version'], { cwd: tmpdir() }).exitCode === 0
        } catch {
          ok = false
        }
      }
      return ok
    },
    matches: (path) => LIZARD_EXTENSIONS.some((e) => path.endsWith(e)),
    analyze: (text, path) => analyzeAll([{ text, path }])[0]!,
    analyzeAll,
  }
}

/**
 * The TypeScript analyzer, then the lizard analyzer: the analyzers {@link diffChange} scores
 * complexity with unless a caller passes its own.
 *
 * @experimental
 */
export function defaultAnalyzers(ts: TypeScript | TypeScriptSource | null): Analyzer[] {
  return [createTypescriptAnalyzer(ts), createLizardAnalyzer()]
}
