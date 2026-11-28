import { describe, expect, test } from 'vitest'

import {
  createLizardAnalyzer,
  createTypescriptAnalyzer,
  parseLizardCsv,
} from '../src/analysis/complexity.ts'
import { extractApi } from '../src/analysis/api.ts'
import { loadTypeScript, withParseMemo, type TypeScript } from '../src/analysis/typescript.ts'

const typescriptAnalyzer = createTypescriptAnalyzer(loadTypeScript(process.cwd()))

describe('createTypescriptAnalyzer', () => {
  test('counts decision points per function; nested functions are separate', () => {
    const src = `
function a(x: number) {
  if (x > 1 && x < 5) return 1
  for (const i of [1]) { if (i) {} }
  return x ? 1 : 2
}
const b = () => { try {} catch {} ; return () => 1 }
class K {
  m(s: string) {
    switch (s) { case 'a': return 1; case 'b': return 2; default: return 3 }
  }
  get g() { return a ?? 1 }
}
top(); if (true) {}
`
    const m = typescriptAnalyzer.analyze(src, 'x.ts')
    expect(m.get('a')).toBe(1 + 1 + 1 + 1 + 1 + 1) // 1, plus if, &&, for-of, if, ?:
    expect(m.get('b')).toBe(2)
    expect(m.get('b.<anonymous 1>')).toBe(1)
    expect(m.get('K.m')).toBe(3)
    expect(m.get('K.get g')).toBe(2)
    expect([...m.keys()].some((k) => k === 'top')).toBe(false)
  })

  test('a class expression is named after what it is assigned to', () => {
    const a = 'export const A = class { run(x){return x} }'
    const b = 'export const B = class { run(x){ if(x) return 1; return 2 } }'
    const one = typescriptAnalyzer.analyze(`${a}\n${b}`, 'x.ts')
    const swapped = typescriptAnalyzer.analyze(`${b}\n${a}`, 'x.ts')
    expect(Object.fromEntries(one)).toEqual({ 'A.run': 1, 'B.run': 2 })
    expect(Object.fromEntries(swapped)).toEqual(Object.fromEntries(one))
    const prop = typescriptAnalyzer.analyze('const o = { K: class { m(){} } }', 'x.ts')
    expect([...prop.keys()]).toEqual(['K.m'])
  })

  test('duplicate names are disambiguated', () => {
    const m = typescriptAnalyzer.analyze('function f(){}\nfunction f(a){ if(a){} }', 'x.ts')
    expect([...m.keys()].sort()).toEqual(['f', 'f#2'])
  })

  test('bodiless overloads, declarations and abstract methods are not functions', () => {
    const src = `export function f(a: number): void
export function f(a: string): void
export function f(a: number | string): void { if (a) return }
declare function d(): void
abstract class A {
  abstract m(): void
  constructor()
  constructor(x?: number) {}
}`
    const m = typescriptAnalyzer.analyze(src, 'x.ts')
    expect([...m.entries()].sort()).toEqual([
      ['A.constructor', 1],
      ['f', 2],
    ])
  })
})

test('the API and complexity passes parse each side of a file once between them', () => {
  const ts = loadTypeScript(process.cwd())!
  let parses = 0
  const counted = new Proxy(ts, {
    get: (target, key) =>
      key === 'createSourceFile'
        ? (...args: Parameters<TypeScript['createSourceFile']>) => {
            parses += 1
            return target.createSourceFile(...args)
          }
        : target[key as keyof TypeScript],
  })
  const analyzer = createTypescriptAnalyzer(counted)
  const before = 'export class A { f(x: number) { return x ? 1 : 2 } }\n'
  const after = 'export class A { f(x: number) { return x } }\n'
  withParseMemo(() => {
    for (const side of [before, after]) extractApi('ts', side, 'a.ts', counted)
    expect(analyzer.analyze(before, 'a.ts')).toEqual(new Map([['A.f', 2]]))
    expect(analyzer.analyze(after, 'a.ts')).toEqual(new Map([['A.f', 1]]))
  })
  expect(parses).toBe(2)
  // Outside a run nothing is kept, so a long-lived caller holds no syntax tree.
  analyzer.analyze(after, 'a.ts')
  expect(parses).toBe(3)
})

describe('lizard', () => {
  const csv =
    '3,2,20,1,3,"f@1-3@x.rs","x.rs","f","f( a )",1,3\n5,4,30,0,5,"g@4-8@x.rs","x.rs","g","g(  )",4,8\n'
  test('parses lizard CSV', () => {
    expect([...parseLizardCsv(csv)]).toEqual([
      ['f', 2],
      ['g', 4],
    ])
  })
  test('functions are keyed by qualified name without parameters, so same names in two types stay apart', () => {
    const row = (name: string, long: string, ccn: number) =>
      `3,${ccn},20,1,3,"${name}@1-3@x.cpp","x.cpp","${name}","${long}",1,3\n`
    const before = parseLizardCsv(row('make', 'Bar::make( int a )', 2))
    const after = parseLizardCsv(
      row('make', 'Foo::make( )', 5) + row('make', 'Bar::make( int a , int b )', 2),
    )
    expect(before.get('Bar::make')).toBe(2)
    expect(after.get('Bar::make')).toBe(2)
    expect(after.get('Foo::make')).toBe(5)
  })
  test('a Rust long name has no parentheses, so the function column keys it and a parameter rename keeps the key', () => {
    // As lizard 1.26 writes Rust rows.
    const before = parseLizardCsv('3,2,22,1,3,"f@1-3@a.rs","a.rs","f","f x : i32",1,3\n')
    const after = parseLizardCsv('3,2,22,1,3,"f@1-3@a.rs","a.rs","f","f count : i32",1,3\n')
    expect([...before]).toEqual([['f', 2]])
    expect([...after]).toEqual([['f', 2]])
    // Lizard 1.26's own rows: a type that ends in the function's name keeps the parameters out too.
    const rows = [
      '3,2,22,1,3,"f@1-3@a.rs","a.rs","f","f x : i32 , i32",1,3',
      '3,1,22,1,3,"set@1-3@a.rs","a.rs","set","set x : Offset",4,6',
      '3,1,22,1,3,"read@1-3@a.kt","a.kt","read","read t : Thread",7,9',
      '3,1,22,1,3,"Foo::make@1-3@a.cpp","a.cpp","Foo::make","Foo::make( int a)",10,12',
      '3,3,22,1,3,"Foo::operator ( )@1-3@a.cpp","a.cpp","Foo::operator ( )","Foo::operator ( )( int a)",13,15',
      '3,4,22,1,3,"A::B::n@1-3@A.java","A.java","B::n","A::B::n()",16,18',
    ].join('\n')
    expect([...parseLizardCsv(rows)]).toEqual([
      ['f', 2],
      ['set', 1],
      ['read', 1],
      ['Foo::make', 1],
      ['Foo::operator ( )', 3],
      ['A::B::n', 4],
    ])
  })
  test('runs through an injected runner; unavailable when --version fails', () => {
    const ok = createLizardAnalyzer({
      run: (argv) => ({
        exitCode: 0,
        // Lizard names each file as it was given.
        stdout: argv[0] === '--csv' ? csv.replaceAll('x.rs', argv[1]!) : 'lizard 1.17',
        stderr: '',
      }),
    })
    expect(ok.available()).toBe(true)
    expect(ok.matches('a/b.rs')).toBe(true)
    expect(ok.analyze('fn f(){}', 'b.rs').get('g')).toBe(4)
    const missing = createLizardAnalyzer({
      run: () => ({ exitCode: 127, stdout: '', stderr: 'nf' }),
    })
    expect(missing.available()).toBe(false)
    const broken = createLizardAnalyzer({
      run: (argv) =>
        argv[0] === '--csv'
          ? { exitCode: -1, stdout: '', stderr: '', neverExited: true, reason: 'timeout' as const }
          : { exitCode: 0, stdout: 'lizard 1.17', stderr: '' },
    })
    expect(() => broken.analyze('fn f(){}', 'b.rs')).toThrow('lizard failed')
  })
  test('scores many texts with one run, splitting its rows by file', () => {
    const runs: string[][] = []
    const timeouts: (number | undefined)[] = []
    const lizard = createLizardAnalyzer({
      run: (argv, opts) => {
        runs.push([...argv])
        timeouts.push(opts?.timeoutMs)
        const row = (file: string, name: string, ccn: number) =>
          `3,${ccn},20,1,3,"${name}@1-3@${file}","${file}","${name}","${name}( )",1,3\n`
        return {
          exitCode: 0,
          stdout: row('0.rs', 'f', 2) + row('2.py', 'g', 5) + row('0.rs', 'h', 3),
          stderr: '',
        }
      },
    })
    const scored = lizard.analyzeAll!([
      { text: 'fn f(){}', path: 'a/x.rs' },
      { text: '', path: 'b/y.go' },
      { text: 'def g(): pass', path: 'c/z.py' },
    ])
    expect(runs).toEqual([['--csv', '0.rs', '1.go', '2.py']])
    lizard.analyzeAll!([{ text: 'fn f(){}', path: 'a/x.rs' }], { timeoutMs: 7_000 })
    // 60 s and 1 s a file, unless the caller gives a timeout.
    expect(timeouts).toEqual([63_000, 7_000])
    expect(scored.map((m) => [...m])).toEqual([
      [
        ['f', 2],
        ['h', 3],
      ],
      [],
      [['g', 5]],
    ])
  })
})
