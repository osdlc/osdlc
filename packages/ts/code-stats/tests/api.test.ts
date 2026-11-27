import { describe, expect, test } from 'vitest'

import { apiLanguage, diffApi, extractApi, isEntryPoint } from '../src/analysis/api.ts'
import { loadTypeScript } from '../src/analysis/typescript.ts'

const ts = loadTypeScript(process.cwd())

describe('apiLanguage', () => {
  test('entry points only for TS', () => {
    expect(apiLanguage('pkg/src/index.ts')).toBe('ts')
    expect(isEntryPoint('pkg/src/index.ts')).toBe(true)
    expect(isEntryPoint('pkg/src/util.ts')).toBe(false)
    expect(apiLanguage('pkg/src/util.ts')).toBe('ts')
    expect(apiLanguage('pkg/src/util.test.ts')).toBeNull()
    expect(apiLanguage('pkg/index.d.ts')).toBeNull()
    expect(apiLanguage('crates/x/src/lib.rs')).toBe('rust')
  })
})

describe('TS surface', () => {
  const before = `export function a(x: number): number { return x }
export const K = 1
export interface I { a: string }
export { b, c as d } from './m'
export * from './all'
function hidden() {}
`
  const after = `export function a(x: number, y: number): number { return x }
export const K = 2
export type T = string
export {
  b,
  e,
} from './m'
export * from './all'
export default 1
`
  test('added, removed, changed', () => {
    const d = diffApi(extractApi('ts', before, 'x.ts', ts), extractApi('ts', after, 'x.ts', ts))
    expect(d.changed).toEqual(['a'])
    expect(d.added.sort()).toEqual(['T', 'default', 'e'])
    expect(d.removed.sort()).toEqual(['I', 'I.a', 'd'])
  })
  test('type-only specifiers in a list are keyed by their name', () => {
    expect([...extractApi('ts', 'export {\n  type A,\n  b,\n}', 'x.ts', ts).keys()].sort()).toEqual(
      ['A', 'b'],
    )
  })
  test('a /* inside a string does not hide the exports after it', () => {
    const before = `const GLOB = 'packages/*/src'
export function a() {}
export function b() {}
/** doc */
export function c() {}`
    const after = before
      .replace('export function a() {}', 'export function a(x: number) {}')
      .replace('/** doc */', 'export function added() {}\n/** doc */')
    expect([...extractApi('ts', before, 'x.ts', ts).keys()].sort()).toEqual(['a', 'b', 'c'])
    const d = diffApi(extractApi('ts', before, 'x.ts', ts), extractApi('ts', after, 'x.ts', ts))
    expect(d).toEqual({ added: ['added'], removed: [], changed: ['a'] })
    const noGlob = before.replace("const GLOB = 'packages/*/src'\n", '')
    expect(
      diffApi(extractApi('ts', noGlob, 'x.ts', ts), extractApi('ts', before, 'x.ts', ts)),
    ).toEqual({
      added: [],
      removed: [],
      changed: [],
    })
  })
  test('a comment that quotes an export is still stripped', () => {
    const src =
      '/**\n * export function fake() {}\n */\n// export const nope = 1\nexport const k = "//x"'
    expect([...extractApi('ts', src, 'x.ts', ts).keys()]).toEqual(['k'])
  })
  test('const initializer change is not an API change', () => {
    expect(extractApi('ts', 'export const K = 1', 'x.ts', ts).get('K')).toBe(
      extractApi('ts', 'export const K = 2', 'x.ts', ts).get('K'),
    )
  })
})

describe('Rust surface', () => {
  test('pub items only', () => {
    const m = extractApi(
      'rust',
      'pub fn a(x: u8) -> u8 {\n}\npub(crate) fn hidden() {}\nfn private() {}\n    pub struct S;\npub async fn b() {}\n',
      'x.rs',
      null,
    )
    expect([...m.keys()].sort()).toEqual(['fn a', 'fn b', 'struct S'])
    expect(m.get('fn a')).toBe('fn a(x: u8) -> u8')
  })
})

describe('exported class and interface members', () => {
  const before = `export class Git {
  private secret = 1
  #hidden = 2
  run(a: string): void {}
  get head(): string { return '' }
}
export interface Opts { a?: string }
class Internal { m() {} }
`
  const after = `export class Git {
  private secret = 1
  #hidden = 2
  run(
    a: string,
    b: number,
  ): void {}
  get head(): string { return '' }
  soft(rev: string): void {}
  static readonly KIND = 'x'
}
export interface Opts { a?: string; b: number }
class Internal { m() {} n() {} }
`
  test('added and changed members are found, private and unexported are not', () => {
    const d = diffApi(extractApi('ts', before, 'x.ts', ts), extractApi('ts', after, 'x.ts', ts))
    expect(d.added.sort()).toEqual(['Git.KIND', 'Git.soft', 'Opts.b'])
    expect(d.changed).toEqual(['Git.run'])
    expect(d.removed).toEqual([])
  })
})

describe('signatures that share a key', () => {
  const delta = (before: string, after: string, lang: 'ts' | 'rust' = 'ts') =>
    diffApi(extractApi(lang, before, 'x.ts', ts), extractApi(lang, after, 'x.ts', ts))

  test('removing a getter that has a setter is a change', () => {
    const before = 'export class A {\n  get x(): number { return 1 }\n  set x(v: number) {}\n}\n'
    const after = 'export class A {\n  set x(v: number) {}\n}\n'
    expect(delta(before, after).changed).toEqual(['A.x'])
  })

  test('adding, removing or changing a method overload is a change', () => {
    const impl = '  m(a: any) {}\n}\n'
    const before = `export class C {\n${impl}`
    const after = `export class C {\n  m(a: number): void\n${impl}`
    expect(delta(before, after).changed).toEqual(['C.m'])
  })

  test('removing a top-level function overload is a change', () => {
    const one = 'export function parse(s: string): number;\n'
    const two = 'export function parse(s: string, radix: number): number;\n'
    const impl = 'export function parse(s: string, radix?: number): number { return 0 }\n'
    expect(delta(one + two + impl, one + impl).changed).toEqual(['parse'])
  })

  test('Rust: `pub const fn` and `pub static mut` are keyed by their own names', () => {
    const before =
      'pub const fn new() -> Self { Self }\npub const fn len(&self) -> usize { 0 }\npub static mut X: u8 = 0;\n'
    const after =
      'pub const fn len(&self) -> usize { 0 }\npub static mut X: u8 = 0;\npub extern "C" fn ffi() {}\n'
    const m = extractApi('rust', before, 'x.ts', ts)
    expect([...m.keys()].sort()).toEqual(['fn len', 'fn new', 'static X'])
    expect(m.get('fn len')).toBe('const fn len(&self) -> usize')
    expect(delta(before, after, 'rust')).toEqual({
      added: ['fn ffi'],
      removed: ['fn new'],
      changed: [],
    })
  })

  test('reordering a getter and its setter, or merged declarations, is no change', () => {
    const getSet = 'export class A {\n  get x(): number { return 1 }\n  set x(v: number) {}\n}\n'
    const setGet = 'export class A {\n  set x(v: number) {}\n  get x(): number { return 1 }\n}\n'
    expect(delta(getSet, setGet)).toEqual({ added: [], removed: [], changed: [] })
    const iface = 'export interface X { a: number }\n'
    const value = 'export const X = 1\n'
    expect(delta(iface + value, value + iface)).toEqual({ added: [], removed: [], changed: [] })
  })

  test('Rust: adding `unsafe` or dropping `const` on a public fn is a change', () => {
    const plain = 'pub fn f() {}\n'
    expect(delta(plain, 'pub unsafe fn f() {}\n', 'rust').changed).toEqual(['fn f'])
    expect(delta('pub const fn f() {}\n', plain, 'rust').changed).toEqual(['fn f'])
    expect(delta('pub static X: u8 = 0;\n', 'pub static mut X: u8 = 0;\n', 'rust').changed).toEqual(
      ['static X'],
    )
  })
})

describe('comments and strings', () => {
  test('a `/*` inside a string does not open a comment that swallows exports', () => {
    const before =
      "const GLOB = 'src/*.ts'\nexport function keep(a: string): void {}\nexport function f(a: string): void {}\nconst X = '*/'\n"
    const after = before.replace('f(a: string)', 'f(a: number, b: number)')
    expect([...extractApi('ts', before, 'x.ts', ts).keys()].sort()).toEqual(['f', 'keep'])
    expect(
      diffApi(extractApi('ts', before, 'x.ts', ts), extractApi('ts', after, 'x.ts', ts)).changed,
    ).toEqual(['f'])
  })

  test('adding a doc comment after a glob string does not add an export', () => {
    const before =
      "export const GLOB = 'packages/*/package.json'\nexport function alpha() {}\nexport function beta() {}\n/** gamma doc */\nexport function gamma() {}\n"
    const after = before.replace('export function beta', '/** beta doc */\nexport function beta')
    expect(
      diffApi(extractApi('ts', before, 'x.ts', ts), extractApi('ts', after, 'x.ts', ts)),
    ).toEqual({
      added: [],
      removed: [],
      changed: [],
    })
  })

  test('a trailing line comment in an export list is not part of the next name', () => {
    const before = "export {\n  foo, // the foo\n  bar,\n} from './impl.ts'\n"
    expect([...extractApi('ts', before, 'x.ts', ts).keys()].sort()).toEqual(['bar', 'foo'])
    const after = before.replace('the foo', 'the foo, now cached')
    expect(
      diffApi(extractApi('ts', before, 'x.ts', ts), extractApi('ts', after, 'x.ts', ts)),
    ).toEqual({
      added: [],
      removed: [],
      changed: [],
    })
  })

  test('a `/*` inside a regex literal does not open a comment that swallows exports', () => {
    const source =
      'const SLASH_OR_STAR = /[/*]/\nexport const a = 1\nexport function b(): void {}\n'
    expect([...extractApi('ts', source, 'x.ts', null).keys()].sort()).toEqual(['a', 'b'])
  })

  test('Rust: a lifetime opens no string, so a comment after it is still stripped', () => {
    const source = [
      "pub fn name<'a>(x: &'a str) -> &'a str { x } // pub use hidden::Old;",
      "impl<'a> Wrap<'a> {} /* pub use hidden::Gone; */",
      'pub use crate::shown::New;',
    ].join('\n')
    expect([...extractApi('rust', source, 'lib.rs', null).keys()].sort()).toEqual([
      'fn name',
      'use New',
    ])
  })

  test('Rust: a `pub` item inside a block comment is not API', () => {
    const source = [
      '/*',
      'pub fn old() {}',
      '*/',
      'pub fn kept() -> &\'static str { "pub fn not_this" }',
    ].join('\n')
    const api = extractApi('rust', source, 'lib.rs', null)
    expect([...api.keys()]).toEqual(['fn kept'])
    expect(api.get('fn kept')).toBe("fn kept() -> &'static str")
  })

  test('a const cut at its initializer keeps an arrow in its type', () => {
    const before = 'export const f: (a: number) => number = (a) => a'
    const after = 'export const f: (a: number) => string = (a) => String(a)'
    expect(extractApi('ts', before, 'x.ts', ts).get('f')).toBe('const f: (a: number) => number')
    expect(
      diffApi(extractApi('ts', before, 'x.ts', ts), extractApi('ts', after, 'x.ts', ts)).changed,
    ).toEqual(['f'])
  })
})

test('Rust items that share a name across impl blocks are all compared', () => {
  const before =
    'impl A {\n    pub fn new(x: u32) -> Self { A }\n}\nimpl B {\n    pub fn new() -> Self { B }\n}\n'
  const after =
    'impl A {\n    pub fn new(x: u64, y: bool) -> Self { A }\n}\nimpl B {\n    pub fn new() -> Self { B }\n}\n'
  const d = diffApi(
    extractApi('rust', before, 'x.rs', null),
    extractApi('rust', after, 'x.rs', null),
  )
  expect(d.changed).toEqual(['fn new'])
})

test("Rust's pub use re-exports are API: removing one is reported", () => {
  const before = [
    'pub use crate::inner::Widget;',
    'pub use crate::x::{',
    '  A,',
    '  b::C as D,',
    '  e::{self, F},',
    '  g::*,',
    '};',
    'pub(crate) use crate::hidden::H;',
    '// pub use commented::Out;',
    'pub mod inner;',
  ].join('\n')
  const api = extractApi('rust', before, 'lib.rs', null)
  expect([...api.keys()].sort()).toEqual(
    [
      'mod inner',
      'use * from crate::x::g',
      'use A',
      'use D',
      'use F',
      'use Widget',
      'use e',
    ].sort(),
  )
  expect(api.get('use D')).toBe('pub use crate::x::b::C as D')
  const after = before.replace('pub use crate::inner::Widget;\n', '')
  expect(diffApi(api, extractApi('rust', after, 'lib.rs', null))).toEqual({
    added: [],
    removed: ['use Widget'],
    changed: [],
  })
})
