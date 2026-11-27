import { describe, expect, test } from 'vitest'

import { categorizeChange, dependencyChange, type FileSides } from '../src/diff/categories.ts'
import { parseDiff, type FileDiff } from '../src/diff/parse.ts'
import { createGroupClassifier } from '../src/groups.ts'
import { createScannerRegistry } from '../src/scan/registry.ts'
import { prefixKind } from '../src/scan/prefix.ts'
import { diff } from './helpers.ts'

const registry = createScannerRegistry()
const role = createGroupClassifier()

/** The category with kinds from the one-line rule, as for a diff whose files cannot be read. */
function categoryOf(f: FileDiff, sides: Partial<FileSides> = {}) {
  const language = registry.languageOf(f.path)
  const group = role({ path: f.path, category: language.category })
  const kinds = (lines: FileDiff['added']) => lines.map((l) => prefixKind(l.text))
  return categorizeChange(f, {
    group,
    language: language.name,
    added: kinds(f.added),
    removed: kinds(f.removed),
    dependencies: dependencyChange(f),
    ...sides,
  })
}
/** A side's whole text, when its changed lines are the whole file, as in a diff from `diff()`. */
function wholeText(lines: FileDiff['added']): string | null {
  if (!lines.every((l, i) => l.at === i + 1)) return null
  return lines.map((l) => `${l.text}${l.cr ? '\r' : ''}\n`).join('')
}
/** The category of a diff whose files are just its lines, read whole. */
function cat(d: string) {
  const f = parseDiff(d)[0]!
  return categoryOf(f, { before: wholeText(f.removed), after: wholeText(f.added) })
}

describe('categorizeChange', () => {
  test('logic by default', () => {
    expect(cat(diff('lib/a.ts', ['-a()', '+b()']))).toBe('logic')
  })
  test('comment-only edit', () => {
    expect(cat(diff('lib/a.ts', ['-// old', '+// new', '+']))).toBe('comments')
  })
  test('formatting-only: re-wrapped and re-indented', () => {
    expect(cat(diff('lib/a.ts', ['-foo(a, b)', '+foo(', '+  a,', '+  b,', '+)']))).toBe('logic')
    expect(cat(diff('lib/a.ts', ['-foo(a,b)', '+foo(a, b)']))).toBe('formatting')
    expect(cat(diff('lib/a.json', ['-{"a":1}', '+{ "a": 1 }']))).toBe('formatting')
  })
  test('formatting-only is conservative: indentation, order and string whitespace count', () => {
    expect(cat(diff('lib/a.py', ['-  x = 1', '+    x = 1']))).toBe('logic')
    expect(cat(diff('lib/a.ts', ['-  x = 1', '+    x = 1']))).toBe('formatting')
    expect(cat(diff('lib/a.ts', ['-a()', '-b()', '+b()', '+a()']))).toBe('logic')
    expect(cat(diff('lib/a.ts', ['-x = "a b"', '+x = "a  b"']))).toBe('logic')
  })
  test('formatting-only refuses what it cannot prove: each reviewed case stays logic', () => {
    const f = (path: string, body: string[]) => cat(diff(path, body))
    // a pure move: one block only removes, another only adds
    const move =
      'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +0,0 @@\n-foo()\n@@ -5,0 +5 @@\n+foo()\n'
    expect(cat(move)).toBe('logic')
    expect(f('a.ts', ['-const s = `a  b`', '+const s = `a b`'])).toBe('logic')
    expect(f('a.ts', ['-  hello  world', '+  hello world'])).toBe('logic')
    expect(f('a.py', ['-x = """a  b"""', '+x = """a b"""'])).toBe('logic')
    expect(f('a.sh', ['-cat <<EOF  x', '+cat <<EOF x'])).toBe('logic')
    expect(f('a.ts', ['-const r = /a  b/g', '+const r = /a b/g'])).toBe('logic')
    expect(f('a.ts', ['-x = "a\\" b"', '+x = "a\\"b"'])).toBe('logic')
    // a stray apostrophe: not formatting (it is kept, as a comment edit)
    expect(f('a.ts', ["-// don't  go", "+// don't go"])).toBe('comments')
    expect(f('a.ts', ['-const v = a + +b', '+const v = a++b'])).toBe('logic')
    expect(f('a.rb', ['-  puts 1', '+    puts 1'])).toBe('logic')
    expect(f('a.sh', ['-if x; then', '+if  x; then'])).toBe('logic')
  })
  test('whitespace that carries meaning outside the C-like languages is not formatting', () => {
    const f = (path: string, body: string[]) => cat(diff(path, body))
    expect(f('deploy.sh', ['-FOO=bar', '+FOO = bar'])).toBe('logic')
    expect(f('deploy.sh', ['-rm -rf "$DIR"', '+rm-rf "$DIR"'])).toBe('logic')
    expect(f('run.sh', ['-if [ -f x ]; then', '+if [-f x]; then'])).toBe('logic')
    expect(f('ci.yml', ['-  - run: build', '+  -run: build'])).toBe('config')
    expect(f('ci.yml', ['-key: value', '+key:value'])).toBe('config')
    expect(f('s.css', ['-.a .b { color: red }', '+.a.b { color: red }'])).toBe('logic')
    expect(f('a.rb', ['-  puts -x', '+  puts - x'])).toBe('logic')
  })
  test('a change from CRLF to LF line endings alone is formatting, except where a CR is meaning', () => {
    const f = (path: string, body: string[]) => cat(diff(path, body))
    expect(f('a.ts', ['-const a = 1\r', '+const a = 1'])).toBe('formatting')
    expect(f('a.bat', ['-echo a\r', '+echo a'])).toBe('formatting')
    // A shell reads `then\r` as a different word and `echo a\r` prints the CR.
    expect(f('a.sh', ['-echo a\r', '-  exit 1\r', '+echo a', '+  exit 1'])).toBe('logic')
    expect(f('Makefile', ['-\tcc a.c\r', '+\tcc a.c'])).toBe('logic')
    expect(f('a.py', ['-x = 1\r', '+x  = 1'])).toBe('logic')
  })
  test('formatting-only is decided by language, whatever extension names it', () => {
    const f = (path: string, body: string[]) => cat(diff(path, body))
    expect(f('a.mts', ['-  x = 1', '+    x = 1'])).toBe('formatting')
    expect(f('a.cts', ['-f(a,b)', '+f(a, b)'])).toBe('formatting')
    expect(f('a.cc', ['-int x=1;', '+int x = 1;'])).toBe('formatting')
    expect(f('a.hh', ['-  int x;', '+int x;'])).toBe('formatting')
    expect(f('a.cxx', ['-#define F (x)', '+#define F(x)'])).not.toBe('formatting')
    expect(f('a.less', ['-.a .b { color: red }', '+.a.b { color: red }'])).toBe('logic')
    expect(f('a.less', ['-.a{color:red}', '+.a { color: red }'])).toBe('formatting')
    expect(f('a.scss', ['-  color: red;', '+color: red;'])).toBe('formatting')
    expect(f('a.sass', ['-  color: red', '+color: red'])).toBe('logic')
  })
  test('formatting-only still recognises plain layout changes', () => {
    const f = (path: string, body: string[]) => cat(diff(path, body))
    expect(f('a.ts', ['-const v = a+b', '+const v = a + b'])).toBe('formatting')
    expect(f('a.rs', ['-    let x=1;', '+let x = 1;'])).toBe('formatting')
    expect(f('a.ts', ['-x = "a\\" b"', '+x   =   "a\\" b"'])).toBe('formatting')
    expect(f('a.rb', ['-  puts(1,2)  ', '+  puts(1,2)'])).toBe('formatting')
    expect(f('a.rb', ['-  puts(1, 2)  ', '+  puts(1, 2)'])).toBe('formatting')
    expect(f('a.ts', ['-a(1,2)', '-b(3,4)', '+a(1, 2)', '+b(3, 4)'])).toBe('formatting')
  })
  test('tests, docs, config, generated', () => {
    expect(cat(diff('lib/a.test.ts', ['-a', '+b']))).toBe('tests')
    expect(cat(diff('docs/a.md', ['-a', '+b']))).toBe('docs')
    expect(cat(diff('ci.yml', ['-a: 1', '+a: 2']))).toBe('config')
    expect(cat(diff('bun.lock', ['-a', '+b']))).toBe('generated')
  })
  test('added, deleted, renamed beat content categories', () => {
    const add =
      'diff --git a/x.test.ts b/x.test.ts\nnew file mode 100644\n--- /dev/null\n+++ b/x.test.ts\n@@ -0,0 +1 @@\n+a\n'
    const del =
      'diff --git a/x.ts b/x.ts\ndeleted file mode 100644\n--- a/x.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-a\n'
    const ren =
      'diff --git a/x.ts b/y.ts\nsimilarity index 100%\nrename from x.ts\nrename to y.ts\n'
    expect(cat(add)).toBe('added')
    expect(cat(del)).toBe('deleted')
    expect(cat(ren)).toBe('renamed')
  })
})

describe('dependencyChange', () => {
  test('package.json added, removed, bumped; non-dep keys ignored', () => {
    const d = diff('package.json', [
      '-  "version": "1.0.0",',
      '+  "version": "1.0.1",',
      '-  "zod": "^3.0.0",',
      '+  "zod": "^4.0.0",',
      '-  "old": "^1.0.0",',
      '+  "new": "workspace:*",',
      '+  "build": "tsc",',
    ])
    const f = parseDiff(d)[0]!
    expect(categoryOf(f)).toBe('dependencies')
    expect(dependencyChange(f)).toEqual({
      file: 'package.json',
      added: [{ name: 'new', version: 'workspace:*' }],
      removed: [{ name: 'old', version: '^1.0.0' }],
      bumped: [{ name: 'zod', from: '^3.0.0', to: '^4.0.0' }],
    })
  })
  test('package.json without dependency entries is config', () => {
    expect(cat(diff('package.json', ['-  "build": "tsc",', '+  "build": "tsc -b",']))).toBe(
      'config',
    )
  })
  test('a dependency moved between sections is not a dependency change', () => {
    const d =
      'diff --git a/package.json b/package.json\n--- a/package.json\n+++ b/package.json\n' +
      '@@ -5 +4,0 @@\n-    "zod": "^4.0.0",\n@@ -12,0 +12 @@\n+    "zod": "^4.0.0",\n'
    const f = parseDiff(d)[0]!
    expect(dependencyChange(f)).toBeNull()
    expect(categoryOf(f)).toBe('config')
  })
  test('Cargo.toml string settings that are not versions are not dependencies', () => {
    const f = parseDiff(
      diff('Cargo.toml', [
        '+[profile.release]',
        '+panic = "abort"',
        '+lto = "fat"',
        '+opt-level = "z"',
      ]),
    )[0]!
    expect(dependencyChange(f)).toBeNull()
    expect(categoryOf(f)).toBe('config')
  })
  test('Cargo.toml', () => {
    const f = parseDiff(
      diff('crates/x/Cargo.toml', [
        '-serde = "1.0.1"',
        '+serde = "1.0.2"',
        '+tokio = { version = "1", features = ["x"] }',
      ]),
    )[0]!
    expect(dependencyChange(f)).toMatchObject({
      added: [{ name: 'tokio', version: '1' }],
      bumped: [{ name: 'serde', from: '1.0.1', to: '1.0.2' }],
    })
  })
})

describe('dependency lines that are not dependency changes', () => {
  test('a Cargo.toml profile or lint key is not a dependency', () => {
    const f = parseDiff(diff('Cargo.toml', ['-opt-level = "3"', '+opt-level = "z"']))[0]!
    expect(dependencyChange(f)).toBeNull()
    expect(categoryOf(f)).toBe('config')
    const lint = parseDiff(
      diff('Cargo.toml', ['-unsafe_code = "warn"', '+unsafe_code = "forbid"']),
    )[0]!
    expect(dependencyChange(lint)).toBeNull()
  })

  test('a re-indented or re-sorted dependency is not a dependency change', () => {
    const indent = parseDiff(diff('package.json', ['-  "zod": "4.4.3"', '+    "zod": "4.4.3"']))[0]!
    expect(dependencyChange(indent)).toBeNull()
    expect(categoryOf(indent)).toBe('config')
    const text = (indent: string) => `{\n  "dependencies": {\n${indent}"zod": "4.4.3"\n  }\n}\n`
    const at3 = parseDiff(
      'diff --git a/package.json b/package.json\n--- a/package.json\n+++ b/package.json\n' +
        '@@ -3 +3 @@\n-    "zod": "4.4.3"\n+      "zod": "4.4.3"\n',
    )[0]!
    expect(categoryOf(at3, { before: text('    '), after: text('      ') })).toBe('formatting')
    const sorted = parseDiff(
      diff('package.json', [
        '-  "b": "^1.0.0",',
        '-  "a": "^2.0.0",',
        '+  "a": "^2.0.0",',
        '+  "b": "^1.0.0",',
      ]),
    )[0]!
    expect(dependencyChange(sorted)).toBeNull()
  })
})

describe('formatting-only respects whitespace that carries meaning', () => {
  const f = (path: string, body: string[]) => cat(diff(path, body))
  test('CSS selectors and C macros', () => {
    expect(f('src/card.css', ['-.card .title {', '+.card.title {'])).not.toBe('formatting')
    expect(f('src/card.scss', ['-a :hover {', '+a:hover {'])).not.toBe('formatting')
    expect(f('src/card.scss', ['-& .x {', '+&.x {'])).not.toBe('formatting')
    expect(f('src/card.css', ['-div [x] {', '+div[x] {'])).not.toBe('formatting')
    expect(
      f('src/m.h', ['-#define SQUARE (x) ((x)*(x))', '+#define SQUARE(x) ((x)*(x))']),
    ).not.toBe('formatting')
    // Layout around punctuation still is formatting.
    expect(f('src/card.css', ['-.a,.b{color:red;}', '+.a, .b { color: red; }'])).toBe('formatting')
    expect(f('src/m.c', ['-int x=f(1,2);', '+int x = f(1, 2);'])).toBe('formatting')
  })

  test('YAML and shell', () => {
    expect(
      f('.github/workflows/ci.yml', ['-      timeout-minutes: 10', '+      timeout-minutes:10']),
    ).not.toBe('formatting')
    expect(f('scripts/run.sh', ['-MODE=release', '+MODE = release'])).not.toBe('formatting')
    expect(f('scripts/run.sh', ['-if [ -f "$x" ]', '+if [-f "$x" ]'])).not.toBe('formatting')
    // Trailing whitespace alone is still layout.
    expect(f('scripts/run.sh', ['-MODE=release  ', '+MODE=release'])).toBe('formatting')
  })

  test('shell outside a shell extension, and every other non-brace file', () => {
    expect(f('Dockerfile', ['-RUN MODE=release make', '+RUN MODE = release make'])).not.toBe(
      'formatting',
    )
    expect(f('Makefile', ['-\tif [ -f x ]; then :; fi', '+\tif [-f x ]; then :; fi'])).not.toBe(
      'formatting',
    )
    expect(f('bin/deploy', ['-MODE=release', '+MODE = release'])).not.toBe('formatting')
    expect(f('.envrc', ['-export A=1', '+export A = 1'])).not.toBe('formatting')
    expect(f('.env', ['-A=1', '+A = 1'])).not.toBe('formatting')
    // Ruby: `puts (1, 2)` is not `puts(1, 2)`.
    expect(f('a.rb', ['-  puts(1,2)', '+  puts (1,2)'])).not.toBe('formatting')
    expect(f('Dockerfile', ['-RUN make  ', '+RUN make'])).toBe('formatting')
  })
})

describe('dependency sections, read from the whole manifest', () => {
  test('an engines bump is not a dependency change once the sections are known', () => {
    const text = (v: string) => `{\n  "engines": {\n    "node": "${v}"\n  }\n}\n`
    const f = parseDiff(
      'diff --git a/package.json b/package.json\n--- a/package.json\n+++ b/package.json\n@@ -3 +3 @@\n-    "node": ">=20"\n+    "node": ">=22"\n',
    )[0]!
    expect(dependencyChange(f, { before: text('>=20'), after: text('>=22') })).toBeNull()
    // Without the text, the engines key still reads as no dependency.
    expect(dependencyChange(f)).toBeNull()
  })

  test('a dependency inside its section still counts', () => {
    const text = (v: string) => `{\n  "dependencies": {\n    "zod": "${v}"\n  }\n}\n`
    const f = parseDiff(
      'diff --git a/package.json b/package.json\n--- a/package.json\n+++ b/package.json\n@@ -3 +3 @@\n-    "zod": "^3.0.0"\n+    "zod": "^4.0.0"\n',
    )[0]!
    expect(dependencyChange(f, { before: text('^3.0.0'), after: text('^4.0.0') })?.bumped).toEqual([
      { name: 'zod', from: '^3.0.0', to: '^4.0.0' },
    ])
  })

  test('Cargo tables: profile keys are not dependencies, a [dependencies.x] table is', () => {
    const before = '[profile.release]\nopt-level = "3"\n[dependencies.serde]\nversion = "1.0.1"\n'
    const after = '[profile.release]\nopt-level = "z"\n[dependencies.serde]\nversion = "1.0.2"\n'
    const f = parseDiff(
      'diff --git a/Cargo.toml b/Cargo.toml\n--- a/Cargo.toml\n+++ b/Cargo.toml\n@@ -2 +2 @@\n-opt-level = "3"\n+opt-level = "z"\n@@ -4 +4 @@\n-version = "1.0.1"\n+version = "1.0.2"\n',
    )[0]!
    expect(dependencyChange(f, { before, after })).toEqual({
      file: 'Cargo.toml',
      added: [],
      removed: [],
      bumped: [{ name: 'serde', from: '1.0.1', to: '1.0.2' }],
    })
  })
})

describe('second-review categories', () => {
  test('any value inside a known dependency section is a dependency', () => {
    const before = '{\n  "dependencies": {\n    "a": "^1.0.0"\n  }\n}\n'
    const after =
      '{\n  "dependencies": {\n    "a": "^1.0.0",\n    "d": "latest",\n    "f": "user/repo"\n  }\n}\n'
    const f = parseDiff(
      'diff --git a/package.json b/package.json\n--- a/package.json\n+++ b/package.json\n@@ -3 +3,3 @@\n-    "a": "^1.0.0"\n+    "a": "^1.0.0",\n+    "d": "latest",\n+    "f": "user/repo"\n',
    )[0]!
    expect(dependencyChange(f, { before, after })?.added).toEqual([
      { name: 'd', version: 'latest' },
      { name: 'f', version: 'user/repo' },
    ])
    const cargoBefore = '[dependencies]\nserde = "1"\n'
    const cargoAfter =
      '[dependencies]\nserde = "1"\ntokio = { workspace = true }\nx = { path = "../x" }\n'
    const c = parseDiff(
      'diff --git a/Cargo.toml b/Cargo.toml\n--- a/Cargo.toml\n+++ b/Cargo.toml\n@@ -2,0 +3,2 @@\n+tokio = { workspace = true }\n+x = { path = "../x" }\n',
    )[0]!
    expect(dependencyChange(c, { before: cargoBefore, after: cargoAfter })?.added).toEqual([
      { name: 'tokio', version: '{ workspace = true }' },
      { name: 'x', version: '{ path = "../x" }' },
    ])
  })

  test('a mode-only change and a blank-only change', () => {
    expect(cat('diff --git a/run.sh b/run.sh\nold mode 100644\nnew mode 100755\n')).toBe('mode')
    expect(cat(diff('lib/a.ts', ['+', '+']))).toBe('formatting')
  })
})

describe('formatting-only reads lines with the lexer', () => {
  const f = (path: string, body: string[]) => cat(diff(path, body))
  test('a shift, a template interpolation, a lifetime and a division are code', () => {
    expect(f('a.c', ['-x = a<<2;', '+x = a << 2;'])).toBe('formatting')
    expect(f('a.ts', ['-const s = `a${ x }b`', '+const s = `a${x}b`'])).toBe('formatting')
    expect(f('a.ts', ['-const s = `a ${x}  b`', '+const s = `a ${x} b`'])).toBe('logic')
    expect(f('a.rs', ["-fn f(x: &'a str){}", "+fn f(x: &'a str) {}"])).toBe('formatting')
    expect(f('a.ts', ['-y = a[0] / 2 + b / 3', '+y = a[0]/2 + b/3'])).toBe('formatting')
    expect(f('a.sh', ['-x=`date`  ', '+x=`date`'])).toBe('formatting')
  })

  test("each language's own strings and character literals", () => {
    expect(f('a.c', ["-if (c == ' ') {}", "+if (c == '') {}"])).toBe('logic')
    expect(f('a.c', ["-if (c==' ') {}", "+if (c == ' ') {}"])).toBe('formatting')
    expect(f('a.css', ["-a { content: 'x , y' }", "+a { content: 'x, y' }"])).toBe('logic')
    expect(f('a.json', ['-{"a , b": 1}', '+{"a, b": 1}'])).not.toBe('formatting')
    expect(f('a.json', ['-{"a , b":1}', '+{ "a , b": 1 }'])).toBe('formatting')
  })

  test('a line inside a string that opened above it keeps its whitespace', () => {
    const one = (path: string, was: string, now: string) =>
      parseDiff(
        `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -2 +2 @@\n-${was}\n+${now}\n`,
      )[0]!
    const ts = one('a.ts', '  a = b', '  a  =  b')
    const text = (line: string) => `const s = \`\n${line}\n\`\n`
    expect(categoryOf(ts, { before: text('  a = b'), after: text('  a  =  b') })).toBe('logic')
    // Without the files' text, a line may lie inside a string, so only trailing whitespace may go.
    expect(categoryOf(ts)).toBe('logic')
    expect(categoryOf(one('a.ts', 'a = b  ', 'a = b'))).toBe('formatting')
    const rs = parseDiff(diff('a.rs', ['-   VALUES (?1, ?2)",', '+   VALUES (?1,?2)",']))[0]!
    expect(categoryOf(rs)).toBe('logic')
    const sh = one('a.sh', 'x  ', 'x')
    const heredoc = (line: string) => `cat <<EOF\n${line}\nEOF\n`
    expect(categoryOf(sh, { before: heredoc('x  '), after: heredoc('x') })).toBe('logic')
    const py = one('a.py', 'text  ', 'text')
    const triple = (line: string) => `x = """\n${line}\n"""\n`
    expect(categoryOf(py, { before: triple('text  '), after: triple('text') })).toBe('logic')
    // One side's text missing: the other is still read whole, so its string is still known.
    const tpl = one('a.ts', 'b  ', 'b')
    expect(categoryOf(tpl, { before: 'const s = `a\nb  \n`\n' })).toBe('logic')
  })

  test('whitespace after a backslash, between non-ASCII words, and on a #define line', () => {
    expect(f('a.sh', ['-echo a\\ ', '+echo a\\'])).toBe('logic')
    expect(f('a.ts', ['-const s = ä in ö', '+const s = äin ö'])).toBe('logic')
    expect(f('a.c', ['-#define X 1  ', '+#define X 1'])).toBe('formatting')
    expect(f('a.c', ['-#define F (x) x', '+#define F(x) x'])).not.toBe('formatting')
  })

  test('a #! line keeps all but its trailing whitespace', () => {
    expect(f('bin/a.js', ['-#!/usr/bin/env node', '+# !/usr/bin/env node'])).not.toBe('formatting')
    expect(f('bin/a.js', ['-#!/usr/bin/env node  ', '+#!/usr/bin/env node'])).toBe('formatting')
  })

  test('a comment edit with an apostrophe is judged like any other', () => {
    expect(f('a.ts', ["-// don't go", "+//  don't go"])).toBe('formatting')
    expect(f('a.ts', ["-// don't  go", "+// don't go"])).toBe('comments')
  })

  test('C# raw strings keep their whitespace', () => {
    expect(
      f('a.cs', ['-var s = """', '-  a , b', '-""";', '+var s = """', '+  a, b', '+""";']),
    ).toBe('logic')
    expect(f('a.cs', ['-var s=""" a """;', '+var s = """ a """;'])).toBe('formatting')
  })

  test('a C# raw string opened by four quotes ends at four', () => {
    expect(
      f('a.cs', ['-""""', '-a """ b', '-x , y', '-""""', '+""""', '+a """ b', '+x, y', '+""""']),
    ).toBe('logic')
  })

  test('Kotlin backtick names keep their whitespace', () => {
    expect(f('a.kt', ['-fun `a - b`() {}', '+fun `a -b`() {}'])).toBe('logic')
    expect(f('a.kt', ['-fun `a b`(){}', '+fun `a b`() {}'])).toBe('formatting')
  })

  test('in JSX, the spaces beside a tag are text', () => {
    expect(f('a.tsx', ['-<b>a</b> b', '+<b>a</b>b'])).toBe('logic')
    expect(f('a.jsx', ['-<p> hi</p>', '+<p>hi</p>'])).toBe('logic')
    expect(f('a.js', ['-<p>hi </p>', '+<p>hi</p>'])).toBe('logic')
    expect(f('a.tsx', ['-const f = (x)=>x', '+const f = (x) => x'])).toBe('formatting')
    expect(f('a.tsx', ['-  <p>hi</p>  ', '+<p>hi</p>'])).toBe('formatting')
    // A .ts file holds no markup.
    expect(f('a.ts', ['-type A = B<C> ', '+type A = B<C>'])).toBe('formatting')
    expect(f('a.ts', ['-if (a > b) {}', '+if (a>b) {}'])).toBe('formatting')
  })

  test('markup is judged by extension in any case, and only in files that show a tag', () => {
    expect(f('A.TSX', ['-<p>a</p> b', '+<p>a</p>b'])).toBe('logic')
    expect(f('a.js', ['-if (a>b) {}', '+if (a > b) {}'])).toBe('formatting')
    expect(f('a.tsx', ['-if (a<b) {}', '+if (a < b) {}'])).toBe('formatting')
  })

  test('a language the table does not know may lose only trailing whitespace', () => {
    expect(f('a.unknownext', ['-x = 1  ', '+x = 1'])).toBe('formatting')
    expect(f('a.unknownext', ['-x = 1\\ ', '+x = 1\\'])).not.toBe('formatting')
    expect(f('a.unknownext', ['-x  = 1', '+x = 1'])).not.toBe('formatting')
    // A CR is not trailing whitespace: a shell script with no extension reads `then\r` as a word.
    expect(f('bin/deploy', ['-if true; then\r', '+if true; then'])).not.toBe('formatting')
  })

  test('a file with a byte-order mark is still read whole', () => {
    const d = (bom: string, inString: boolean) =>
      parseDiff(
        `diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,3 +1,3 @@\n` +
          `-${bom}const a  = 1\n+${bom}const a = 1\n const s = \`\n` +
          (inString ? `-  a = b\n+  a  =  b\n` : ` x\n`),
      )[0]!
    const text = (a: string, b: string) => `\uFEFFconst a${a}= 1\nconst s = \`\n  a${b}=${b}b\n\`\n`
    const sides = { before: text('  ', ' '), after: text(' ', '  ') }
    const line1 = { before: text('  ', ' '), after: text(' ', ' ') }
    for (const bom of ['\uFEFF', '']) {
      expect(categoryOf(d(bom, true), sides)).toBe('logic')
      expect(categoryOf(d(bom, false), line1)).toBe('formatting')
    }
    // One side's text missing: both are read block by block, line 1 without its mark.
    const trailing = parseDiff(
      'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n' +
        '-\uFEFFconst a = 1  \n+\uFEFFconst a = 1\n',
    )[0]!
    expect(categoryOf(trailing, { before: '\uFEFFconst a = 1  \n' })).toBe('formatting')
    // A #! line behind a mark is still the system's.
    const shebang = parseDiff(
      'diff --git a/a.js b/a.js\n--- a/a.js\n+++ b/a.js\n@@ -1 +1 @@\n' +
        '-\uFEFF#!/usr/bin/env node  --x\n+\uFEFF#!/usr/bin/env node --x\n',
    )[0]!
    const js = (gap: string) => `\uFEFF#!/usr/bin/env node${gap}--x\nrun()\n`
    expect(categoryOf(shebang, { before: js('  '), after: js(' ') })).not.toBe('formatting')
  })
})
