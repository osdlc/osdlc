import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, test } from 'vitest'

import { resolvePeer } from '../src/peer.ts'
import { createScannerRegistry, splitLines, type LanguageScanner } from '../src/scan/index.ts'
import {
  BUILTIN_GRAMMARS,
  createTreeSitterScanners,
  type TreeSitterGrammar,
} from '../src/tree-sitter/index.ts'
import { annotated } from './helpers.ts'

const PACKAGE = fileURLToPath(new URL('..', import.meta.url))
let scanners: LanguageScanner[]

beforeAll(async () => {
  const loaded = await createTreeSitterScanners({ resolveFrom: PACKAGE })
  expect(loaded.missing).toEqual([])
  scanners = loaded.scanners
})

/** Checks the tree-sitter scanner, and the table-driven one, against the same annotated lines. */
function expectBoth(path: string, source: string): void {
  const { text, kinds } = annotated(source)
  const want = splitLines(text).map((line, i) => `${kinds[i]} | ${line}`)
  const scanner = scanners.find((s) => s.matches(path))!
  const tree = scanner.scan(text, path)
  expect(splitLines(text).map((line, i) => `${tree[i]} | ${line}`)).toEqual(want)
  const table = createScannerRegistry().scan(text, path).kinds
  expect(splitLines(text).map((line, i) => `${table[i]} | ${line}`)).toEqual(want)
}

describe('createTreeSitterScanners', () => {
  test('loads every built-in grammar as a scanner named for it', () => {
    expect(scanners.map((s) => s.id)).toEqual(BUILTIN_GRAMMARS.map((g) => `tree-sitter-${g.id}`))
    expect(BUILTIN_GRAMMARS.map((g) => g.id)).toEqual([
      'typescript',
      'tsx',
      'javascript',
      'rust',
      'python',
      'scala',
      'go',
      'java',
      'c',
      'cpp',
      'c_sharp',
      'ruby',
      'php',
      'bash',
    ])
    expect(scanners.find((s) => s.matches('a/b.TSX'))?.language).toBe('TypeScript')
    const reader = (path: string) => scanners.find((s) => s.matches(path))?.id
    expect(reader('a.h')).toBe('tree-sitter-c')
    expect(reader('a.hpp')).toBe('tree-sitter-cpp')
    expect(reader('a.cs')).toBe('tree-sitter-c_sharp')
    expect(reader('a.sh')).toBe('tree-sitter-bash')
    expect(reader('.bashrc')).toBe('tree-sitter-bash')
  })

  test('a grammar it cannot find is listed as missing', async () => {
    const ghost: TreeSitterGrammar = {
      id: 'ghost',
      language: 'TypeScript',
      extensions: ['ghost'],
      wasm: { package: 'tree-sitter-ghost', file: 'tree-sitter-ghost.wasm' },
      imports: [],
    }
    const loaded = await createTreeSitterScanners({ grammars: [ghost], resolveFrom: PACKAGE })
    expect(loaded).toEqual({ scanners: [], missing: ['ghost'], failed: [] })
  })

  test('a grammar file that will not load is listed as failed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'code-stats-grammars-'))
    writeFileSync(join(dir, 'tree-sitter-rust.wasm'), 'not wasm')
    const rust = BUILTIN_GRAMMARS.filter((g) => g.id === 'rust')
    const loaded = await createTreeSitterScanners({
      grammars: rust,
      grammarsDir: dir,
      resolveFrom: PACKAGE,
    })
    expect(loaded.scanners).toEqual([])
    expect(loaded.missing).toEqual([])
    expect(loaded.failed.map((f) => f.id)).toEqual(['rust'])
  })

  test('scanners plug into a registry ahead of the table', () => {
    const registry = createScannerRegistry({ scanners })
    const scan = registry.scan('import a from "a"\nconst b = a // note\n', 'x.ts')
    expect(scan).toMatchObject({ name: 'TypeScript', reader: 'scanner', fallback: null })
    expect(scan.kinds).toEqual(['boilerplate', 'logic'])
  })

  test("files keep the table's language name, read by the tree", () => {
    const registry = createScannerRegistry({ scanners })
    expect(registry.scan('declare const a: number\n', 'x.d.ts')).toMatchObject({
      name: 'TypeScript Typings',
      reader: 'scanner',
    })
    const jsx = registry.scan(
      '\uFEFFconst a = (\n  <div>\n    {/* note */}\n  </div>\n)\n',
      'x.jsx',
    )
    expect(jsx).toMatchObject({ name: 'JSX', reader: 'scanner' })
    expect(jsx.kinds).toEqual(['logic', 'logic', 'comment', 'logic', 'boilerplate'])
  })
})

describe('tree-sitter import rules', () => {
  const kinds = (path: string, text: string) =>
    scanners.find((s) => s.matches(path))!.scan(text, path)

  test('a trailing comment does not stop require or a directive being boilerplate', () => {
    expect(kinds('a.js', "'use strict' // strict\nconst fs = require('fs') // io\nf()\n")).toEqual([
      'boilerplate',
      'boilerplate',
      'logic',
    ])
  })

  test('module-shape exports are boilerplate; exports of values are logic', () => {
    expect(
      kinds(
        'a.d.ts',
        'export = Foo\nexport as namespace Foo\nexport { a } // all\nexport const b = 1\n',
      ),
    ).toEqual(['logic', 'logic', 'boilerplate', 'logic'])
  })
})

describe('the tree-sitter and table scanners agree', () => {
  test('TypeScript: docs, imports, re-exports, require, templates and punctuation', () => {
    expectBoth(
      'src/a.ts',
      `
      B #!/usr/bin/env node
      B // Copyright 2026 Example Ltd.
      _
      D /** Adds. */
      B import {
      B   a,
      B } from './a.ts'
      B export * from './b.ts'
      B const fs = require('node:fs')
      L export function add(x: number): number {
      L   const t = \`\${x ? \`\${a}/\${x}\` : 'none'}\`
      C   // a note
      L   return x + a // trailing
      B }
      L export default add
      `,
    )
  })

  test('Rust: inner and outer docs, use trees, mod declarations and attributes', () => {
    expectBoth(
      'src/lib.rs',
      `
      D //! Crate docs.
      B use std::fmt::{
      B     Debug,
      B };
      B mod inner;
      D /// A thing.
      L #[derive(Debug)]
      L pub struct Thing;
      L mod tests {
      L     fn t() {}
      B }
      C // plain
      `,
    )
  })

  test('Python: docstrings after a shebang, imports, strings that are not docstrings', () => {
    expectBoth(
      'pkg/mod.py',
      `
      B #!/usr/bin/env python3
      D """Module docs."""
      B from os import (
      B     path,
      B )
      L def f():
      D     """Function docs."""
      L     x = """not a docstring"""
      C     # comment
      L     return x
      `,
    )
  })

  test('Scala: package and imports, a package object with a body', () => {
    expectBoth(
      'a.scala',
      `
      B package a.b
      B import x.y
      D /** Docs. */
      L object O {
      L   def f = 1
      B }
      `,
    )
  })

  test('Go: package and imports, doc-less comments, raw strings with comment openers', () => {
    expectBoth(
      'cmd/main.go',
      `
      C // Package main runs things.
      B package main
      _
      B import "fmt"
      B import (
      B     "os"
      B     str "strings"
      B )
      _
      C /* A block. */
      L func main() {
      L     s := "// not a comment"
      L     r := \`/* raw
      L     }
      L     */\`
      C     // a note
      L     fmt.Println(s, r, os.Args, str.ToUpper(""))
      B }
      `,
    )
  })

  test('Java: package and imports, Javadoc, text blocks, annotations and punctuation', () => {
    expectBoth(
      'src/a/b/A.java',
      `
      B // SPDX-License-Identifier: MIT
      B package a.b;
      _
      B import java.util.List;
      B import static java.lang.Math.max;
      _
      D /** Javadoc. */
      L public class A {
      D   /**
      D    * More.
      D    */
      L   @Override
      L   public String toString() {
      C     // c
      L     String s = "/* not */";
      L     String t = """
      L       // text block
      L       }
      L       """;
      C     /* plain */
      L     return s + t;
      B   }
      B }
      `,
    )
  })

  test('C: includes, #pragma once, doc comments, macros and strings with comment openers', () => {
    expectBoth(
      'src/a.c',
      `
      B #pragma once
      B #include <stdio.h>
      B #  include "a.h"
      L #define X 1
      L #define BLOCK(x) \\
      L   {              \\
      L     f(x);        \\
      B   }
      D /** Doc. */
      D /// Line doc.
      D //! Inner doc.
      L struct s {
      B #include "fields.def"
      L   int n;
      B };
      L int main(void) {
      L   const char *s = "/* no */"
      C     /* between */
      L     "// no";
      C   // c
      L   return 0;
      B }
      `,
    )
  })

  test('C++: headers read as C++, raw strings, using and namespaces', () => {
    expectBoth(
      'src/a.hpp',
      `
      B #pragma once
      B #include <string>
      B #import "x.h"
      L using namespace std;
      L namespace a {
      D /// Doc.
      L class C {
      L  public:
      L   std::string s = R"(// raw
      L }
      L )";
      B };
      B }  // namespace a
      `,
    )
  })

  test('C#: using directives, a file-scoped namespace, XML docs and verbatim strings', () => {
    expectBoth(
      'src/A.cs',
      `
      B using System;
      B global using static System.Math;
      B using Alias = System.Collections.Generic.List<int>;
      B namespace A.B;
      _
      D /// <summary>XML doc.</summary>
      D /** Block doc. */
      L public class E {
      C   // c
      L   string s = "// no";
      L   string v = @"/* no
      L   }
      L   */";
      L   void F() {
      L     using var x = Open();
      B   }
      B }
      `,
    )
  })

  test('C#: a namespace with a body is logic', () => {
    expectBoth(
      'src/B.cs',
      `
      L namespace C {
      B   using System;
      L   class D {}
      B }
      `,
    )
  })

  test('Ruby: require, comments and YARD tags, heredocs and =begin blocks', () => {
    expectBoth(
      'lib/a.rb',
      `
      C # frozen_string_literal: true
      B require 'json'
      B require_relative "b"
      B require "x" unless defined?(X)
      L load 'y.rb'
      L Kernel.require 'z'
      C # A comment.
      C # @param x [Integer] YARD
      L def f(x)
      L   s = "# not"
      L   t = <<~EOS
      L     # heredoc
      L     }
      L   EOS
      L   g(
      L     s, t,
      B   )
      L end
      C =begin
      C block
      C =end
      `,
    )
  })

  test('PHP: HTML around <?php, use and namespace, require, phpdoc and both line comments', () => {
    expectBoth(
      'web/a.php',
      `
      L <html>
      B <?php
      B namespace A\\B;
      B use Foo\\Bar;
      B use function Foo\\baz;
      B require_once 'x.php';
      B include "y.php";
      L $config = require 'config.php';
      D /** Doc. */
      C # hash
      C // slash
      L class K {
      B   use T;
      L   function f() {
      L     $s = "// no";
      L     $h = <<<EOT
      L     # not
      L     }
      L     EOT;
      L     return $s . $h;
      B   }
      B }
      L ?>
      L </html>
      `,
    )
  })

  test('PHP: a namespace with a body is logic; <?php before code is logic', () => {
    expectBoth(
      'b.php',
      `
      L <?php echo 1;
      L namespace C {
      L   function g() {}
      B }
      `,
    )
  })

  test('Bash: source and ., comments, strings and heredocs with # and case items', () => {
    expectBoth(
      'scripts/a.sh',
      `
      B #!/usr/bin/env bash
      C # comment
      B source ./lib.sh
      B . "$HOME/x"
      L set -euo pipefail
      L echo "# not" '# nor this'
      L cat <<EOS
      L # heredoc
      L }
      L EOS
      L f() {
      L   case "$1" in
      L     a) g ;;
      L     b)
      L       h
      B       ;;
      L   esac
      B }
      `,
    )
  })

  test('lines the grammar cannot parse take the table reading', () => {
    expectBoth(
      'src/t.ts',
      `
      L export interface Token {
      L   about: string
      D   /** Which. */
      L   in: ('a' | 'b')[]
      B }
      `,
    )
  })
})

describe('resolvePeer', () => {
  test("the project's copy, else this package's, else null; `accept` can pass one over", () => {
    const empty = mkdtempSync(join(tmpdir(), 'code-stats-peer-'))
    const beside = resolvePeer('web-tree-sitter', empty)
    expect(beside).toMatch(/web-tree-sitter/)
    expect(resolvePeer('web-tree-sitter', PACKAGE)).toBe(beside)
    expect(resolvePeer('no-such-package-here', PACKAGE)).toBeNull()
    expect(resolvePeer('web-tree-sitter', PACKAGE, () => false)).toBeNull()
  })
})

test('Python: strings side by side make one docstring, and a bytes literal is never one', () => {
  const kinds = (text: string) => scanners.find((s) => s.matches('m.py'))!.scan(text, 'm.py')
  expect(kinds('def f():\n    "one" "two"\n    return 1\n')).toEqual(['logic', 'doc', 'logic'])
  expect(kinds('def f():\n    b"bytes"\n    return 1\n')).toEqual(['logic', 'logic', 'logic'])
})
