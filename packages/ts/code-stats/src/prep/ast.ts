/** Shared TypeScript AST reading for the flags. */

import type { TypeScript } from '../analysis/typescript.ts'

export type Node = import('typescript').Node
export type SourceFile = import('typescript').SourceFile

/** Offsets of each `\n` in a file's text, computed once per source file. */
const newlines = new WeakMap<SourceFile, number[]>()

/**
 * 1-based line of a character offset, counting only `\n` as a line end, as
 * git does for the diff's line numbers. TypeScript's own line map also breaks
 * at a lone `\r`, U+2028 and U+2029, which would shift every line after one.
 */
export function lineAt(sf: SourceFile, pos: number): number {
  let ends = newlines.get(sf)
  if (ends === undefined) {
    ends = []
    for (let i = sf.text.indexOf('\n'); i >= 0; i = sf.text.indexOf('\n', i + 1)) ends.push(i)
    newlines.set(sf, ends)
  }
  // The number of line ends before `pos`.
  let lo = 0
  let hi = ends.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (ends[mid]! < pos) lo = mid + 1
    else hi = mid
  }
  return lo + 1
}

export interface FnInfo {
  /** The declared or assigned name; `(anonymous)` for a callback. */
  name: string
  /** First and last line, the first being the keyword or modifier, not a leading comment. */
  start: number
  end: number
  /** A function declaration, or a function value assigned straight to a top-level `const`. */
  moduleLevel: boolean
  /** The syntax node, for callers that compare bodies. */
  node: Node
}

/**
 * Every function-like node in the file, nested ones included: declarations,
 * function and arrow expressions, methods, constructors and accessors that
 * have a body.
 */
export function functionsOf(ts: TypeScript, sf: SourceFile): FnInfo[] {
  const out: FnInfo[] = []
  const visit = (node: Node): void => {
    const info = describe(ts, sf, node)
    if (info !== null) out.push(info)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

function describe(ts: TypeScript, sf: SourceFile, node: Node): FnInfo | null {
  let name: string | null = null
  let moduleLevel = false
  if (ts.isFunctionDeclaration(node)) {
    if (node.body === undefined) return null
    name = node.name?.text ?? 'default'
    moduleLevel = ts.isSourceFile(node.parent)
  } else if (ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) {
    if (node.body === undefined) return null
    name = ts.isConstructorDeclaration(node) ? 'constructor' : propertyName(ts, node.name)
  } else if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    if (node.body === undefined) return null
    name = propertyName(ts, node.name)
  } else if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    const p = node.parent
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) {
      name = p.name.text
      // declaration -> list -> statement -> file
      moduleLevel = ts.isSourceFile(p.parent.parent.parent)
    } else if (ts.isPropertyAssignment(p)) name = propertyName(ts, p.name)
    else if (ts.isFunctionExpression(node) && node.name !== undefined) name = node.name.text
  } else return null
  return {
    name: name ?? '(anonymous)',
    start: lineAt(sf, node.getStart(sf)),
    end: lineAt(sf, node.getEnd()),
    moduleLevel,
    node,
  }
}

function propertyName(ts: TypeScript, n: import('typescript').PropertyName): string | null {
  return ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isPrivateIdentifier(n) ? n.text : null
}

/** True when `node` carries the modifier `kind`. */
export function hasModifier(
  ts: TypeScript,
  node: Node,
  kind: import('typescript').SyntaxKind,
): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind)
}
