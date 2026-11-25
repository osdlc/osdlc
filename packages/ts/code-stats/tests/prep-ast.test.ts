import ts from 'typescript'
import { describe, expect, test } from 'vitest'

import { functionsOf, hasModifier, lineAt } from '../src/prep/ast.ts'

const parse = (text: string) => ts.createSourceFile('a.ts', text, ts.ScriptTarget.Latest, true)

describe('functionsOf', () => {
  test('names each kind of function that has a body', () => {
    const sf = parse(`
function declared() {}
const arrow = () => 1
const expr = function () {}
const obj = { prop: () => 1, 'quoted': function () {}, [computed()]: () => 2 }
class K {
  constructor() {}
  method() {}
  get value() { return 1 }
  set value(v: number) {}
  #hidden() {}
}
export default function () {}
setTimeout(() => {})
const named = function inner() {}
useIt(function viaCall() {})
`)
    const found = functionsOf(ts, sf).map((f) => [f.name, f.moduleLevel])
    expect(found).toEqual([
      ['declared', true],
      ['arrow', true],
      ['expr', true],
      ['prop', false],
      ['quoted', false],
      ['(anonymous)', false],
      ['constructor', false],
      ['method', false],
      ['value', false],
      ['value', false],
      ['#hidden', false],
      ['default', true],
      ['(anonymous)', false],
      ['named', true],
      ['viaCall', false],
    ])
  })

  test('leaves out a declaration with no body, such as an overload', () => {
    const sf = parse(`
function f(a: string): void
function f(a: number): void
function f(a: unknown) {}
abstract class A { abstract m(): void; n(): void {} }
declare function ambient(): void
`)
    expect(functionsOf(ts, sf).map((f) => f.name)).toEqual(['f', 'n'])
  })

  test('a nested function is counted separately, with its own lines', () => {
    const sf = parse('function outer() {\n  function inner() {\n  }\n}\n')
    expect(functionsOf(ts, sf).map((f) => [f.name, f.start, f.end])).toEqual([
      ['outer', 1, 4],
      ['inner', 2, 3],
    ])
  })
})

describe('lineAt', () => {
  test('counts only newlines, as git does', () => {
    const sf = parse('a\r\nb c\rd\ne')
    // `e` follows the second `\n`; the lone `\r` and U+2028 are not line ends.
    expect(lineAt(sf, sf.text.indexOf('e'))).toBe(3)
    expect(lineAt(sf, 0)).toBe(1)
  })
})

describe('hasModifier', () => {
  test('finds a modifier, and is false for a node that cannot carry one', () => {
    const sf = parse('export const a = 1\nconst b = 2\n')
    const [first, second] = sf.statements
    expect(hasModifier(ts, first!, ts.SyntaxKind.ExportKeyword)).toBe(true)
    expect(hasModifier(ts, second!, ts.SyntaxKind.ExportKeyword)).toBe(false)
    expect(hasModifier(ts, sf, ts.SyntaxKind.ExportKeyword)).toBe(false)
  })
})
