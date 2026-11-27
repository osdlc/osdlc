import { describe, expect, test } from 'vitest'

import {
  createScannerRegistry,
  languageNamed,
  prefixKind,
  splitLines,
  type ContentKind,
} from '../src/scan/index.ts'
import { annotated } from './helpers.ts'

const registry = createScannerRegistry()

function expectScan(path: string, source: string): void {
  const { text, kinds } = annotated(source)
  const scan = registry.scan(text, path)
  expect(scan.fallback).toBeNull()
  const rows = splitLines(text).map((line, i) => `${scan.kinds[i]} | ${line}`)
  const want = splitLines(text).map((line, i) => `${kinds[i]} | ${line}`)
  expect(rows).toEqual(want)
}

describe('TypeScript', () => {
  test('doc comments, comments, imports and punctuation', () => {
    expectScan(
      'src/a.ts',
      `
      D /**
      D  * Adds.
      D  */
      B import { a, b } from './b.ts'
      B import type { C } from './c.ts'
      B import './side-effect.css'
      _
      C // A note.
      L export function add(x: number): number {
      L   return x + a // trailing comment, still logic
      B }
      _
      C /* plain block */
      C /**/
      C /*** banner ***/
      L const url = 'http://example.com' /* not a comment start */
      `,
    )
  })

  test('multi-line imports and re-exports stay boilerplate to their close', () => {
    expectScan(
      'src/index.ts',
      `
      B import {
      B   first,
      C   // why second
      B   second,
      B } from './x.ts'
      B export { first, second }
      B export * from './y.ts'
      B export {
      B   third,
      B } from './z.ts'
      L export const imports = 3
      L const lazy = await import('./lazy.ts')
      L const meta = import.meta.url
      `,
    )
  })

  test('strings hide comment markers, template literals span lines', () => {
    expectScan(
      'src/s.ts',
      `
      L const glob = 'src/*.ts'
      L const text = \`line one
      L // inside a template
      L \`
      L const quote = "it's // fine"
      `,
    )
  })

  test('require, directives and triple-slash references', () => {
    expectScan(
      'src/c.js',
      `
      B 'use strict'
      B /// <reference types="node" />
      B const fs = require('node:fs')
      L const x = require('node:fs').readFileSync
      `,
    )
  })

  test('a shebang, a licence header and an SPDX line are boilerplate', () => {
    expectScan(
      'bin/tool.js',
      `
      B #!/usr/bin/env node
      B // Copyright 2026 Example Ltd.
      B // Licensed under the MIT License.
      _
      D /** The tool. */
      L main()
      B // SPDX-License-Identifier: MIT
      `,
    )
  })

  test('a module doc that mentions a licence checker is not a licence header', () => {
    expectScan(
      'src/licence-check.ts',
      `
      D /** Checks that each package declares a licence. */
      L export const check = true
      `,
    )
  })
})

describe('Rust', () => {
  test('inner and outer docs, nested blocks, attributes and use trees', () => {
    expectScan(
      'src/lib.rs',
      `
      D //! Crate docs.
      _
      B use std::fmt;
      B pub use crate::inner::{
      B     Alpha,
      B     Beta,
      B };
      B mod inner;
      _
      D /// A thing.
      L #[derive(Debug, Clone)]
      L pub struct Thing {
      L     pub name: String,
      B }
      _
      C //// four slashes is a plain comment
      C /* outer /* nested */
      C    still outer */
      L const RAW: &str = r#"// not a comment"#;
      `,
    )
  })
})

describe('Python', () => {
  test('docstrings are doc, a string value is logic', () => {
    expectScan(
      'pkg/mod.py',
      `
      B #!/usr/bin/env python3
      D """Module docs.
      _
      D More.
      D """
      B import os
      B from pathlib import (
      B     Path,
      B )
      _
      L def f():
      D     """Function docs."""
      C     # comment
      L     text = """not a docstring
      L     still a string"""
      L     return text
      `,
    )
  })

  test('a one-line string of either quote, with or without a prefix, is a docstring', () => {
    expectScan(
      'pkg/one.py',
      `
      C # -*- coding: utf-8 -*-
      D "Test harness for doctests."
      B import doctest
      _
      L class Case:
      D     'Single-quoted class docs.'
      _
      L     def run(self):
      D         u"Unicode-prefixed docs."
      L         return 1
      _
      L async def fetch():
      D     r'Raw docs: \\d+'
      _
      L def literal():
      D     R"Raw, upper-case prefix."
      `,
    )
  })

  test('strings side by side, or joined by a line continuation, are one docstring', () => {
    expectScan(
      'pkg/joined.py',
      `
      L def f():
      D     "Joined by a continuation " \\
      D     "onto the next line." "And side by side."
      L     return 1
      `,
    )
  })

  test('a docstring is only the first statement of a module, class or function body', () => {
    expectScan(
      'pkg/position.py',
      `
      B from __future__ import annotations
      L """After an import: not the module's docstring."""
      _
      L class A:
      D     """The class's docstring."""
      L     """A second string in the body is not."""
      L     x = 1
      L     'Nor is one after a statement.'
      _
      L if ready:
      L     """After an if."""
      L try:
      L     pass
      L except ValueError:
      L     'After an except.'
      L else:
      L     "After an else."
      L with lock:
      L     """After a with."""
      `,
    )
  })

  test('a header may span lines and carry decorators', () => {
    expectScan(
      'pkg/header.py',
      `
      L @functools.cache
      L @route(
      L     "/path",
      B )
      L def handler(
      L     request,  # the request
      L     *args: "Annotation: with a colon",
      L ) -> dict[str, int]:
      C     # A comment before the docstring.
      D     """The handler's docstring,
      D     on two lines."""
      L     return {}
      `,
    )
  })

  test('a string that goes on as code is no docstring', () => {
    expectScan(
      'pkg/code.py',
      `
      L def f():
      L     """Not a docstring:
      L     a template.""".format(x)
      L def g():
      L     "Nor this" + suffix
      L def h():
      L     "Nor this"; x = 1
      L def k(): "One line, the header's: logic as a whole."
      L class C: """A docstring on the header's line,
      D     whose other lines are doc."""
      L def b():
      L     b"A bytes literal is no docstring."
      `,
    )
  })

  test('an import goes on past a line continuation', () => {
    expectScan(
      'pkg/imports.py',
      `
      B from gi.repository import GLib, \\
      B     GObject, \\
      B     Gio
      B from . helpers import tidy
      B from requests.packages.urllib3.contrib.pyopenssl \\
      B     import PyOpenSSLContext
      L total = first + \\
      L     second
      L assert ok, \\
      L     "A string after a continuation is no docstring."
      `,
    )
  })

  test('a continuation inside a string or a comment joins nothing', () => {
    expectScan(
      'pkg/strings.py',
      `
      B import os  # a comment ending in a backslash \\
      L path = os.sep
      L text = 'a string \\
      L that goes on'
      L value = 1
      `,
    )
  })
})

describe('other languages', () => {
  test('Go package, import block and raw strings', () => {
    expectScan(
      'main.go',
      `
      B package main
      _
      B import (
      B 	"fmt"
      B )
      _
      L var pattern = \`// raw\`
      L func main() { fmt.Println(pattern) }
      `,
    )
  })

  test('C includes, pragma once and doxygen', () => {
    expectScan(
      'include/a.h',
      `
      B #pragma once
      B #include <stdio.h>
      D /*! Doxygen block. */
      D /// Doxygen line.
      L int add(int a, int b);
      `,
    )
  })

  test('YAML and TOML comments are comments, JSON brackets are boilerplate', () => {
    expectScan(
      'config.yaml',
      `
      C # settings
      L key: value # trailing
      `,
    )
    expectScan(
      'Cargo.toml',
      `
      C # workspace
      L [workspace]
      L members = ["a"]
      `,
    )
    expectScan(
      'data.json',
      `
      B {
      L   "a": [1, 2],
      L   "b": {
      L     "c": true
      B   }
      B }
      `,
    )
  })

  test('Markdown is doc, its HTML comments are comments', () => {
    expectScan(
      'README.md',
      `
      D # Title
      _
      C <!-- a note -->
      D Some \`code\` and text.
      `,
    )
  })

  test('a licence file is boilerplate', () => {
    expectScan(
      'LICENSE',
      `
      B MIT License
      _
      B Copyright (c) 2026 Example
      `,
    )
  })
})

describe('registry', () => {
  test('a custom scanner comes before the built-ins', () => {
    const custom = createScannerRegistry({
      scanners: [
        {
          id: 'all-doc',
          language: 'Notes',
          category: 'prose',
          matches: (p) => p.endsWith('.ts') || p.endsWith('.notes'),
          scan: (text) => splitLines(text).map((): ContentKind => 'doc'),
        },
      ],
    })
    expect(custom.scan('const a = 1\n', 'a.notes')).toEqual({
      name: 'Notes',
      category: 'prose',
      kinds: ['doc'],
      reader: 'scanner',
      fallback: null,
    })
    expect(custom.languageOf('a.notes')).toEqual({ name: 'Notes', category: 'prose' })
    expect(custom.languageOf('a.rs')).toEqual({ name: 'Rust', category: 'programming' })
  })

  test("a path the table knows keeps the table's language name under a custom scanner", () => {
    const custom = createScannerRegistry({
      scanners: [
        {
          id: 'all-doc',
          language: 'TypeScript',
          matches: (p) => /\.[jt]sx?$/.test(p),
          scan: (text) => splitLines(text).map((): ContentKind => 'doc'),
        },
      ],
    })
    expect(custom.scan('const a = 1\n', 'x.d.ts')).toEqual({
      name: 'TypeScript Typings',
      category: 'programming',
      kinds: ['doc'],
      reader: 'scanner',
      fallback: null,
    })
    expect(custom.languageOf('x.jsx')).toEqual({ name: 'JSX', category: 'programming' })
  })

  test('a scanner that throws, miscounts or invents a kind falls back to the table, else the one-line rule', () => {
    const scanner = (id: string, ext: string, scan: () => readonly string[]) => ({
      id,
      language: id,
      matches: (p: string) => p.endsWith(ext),
      scan: scan as () => readonly ContentKind[],
    })
    const broken = createScannerRegistry({
      scanners: [
        scanner('throws', '.zzx', () => {
          throw new Error('boom')
        }),
        scanner('short', '.zzy', () => []),
        scanner('odd', '.zzz', () => ['code']),
        {
          id: 'bad-match',
          language: 'W',
          matches: () => {
            throw new Error('no')
          },
          scan: () => [],
        },
      ],
    })
    const thrown = broken.scan('// c\ncode\n', 'a.zzx')
    expect(thrown.kinds).toEqual(['comment', 'logic'])
    expect(thrown.reader).toBe('one-line')
    expect(thrown.fallback).toEqual({ reason: 'scanner-failed', detail: 'throws: Error: boom' })
    expect(broken.scan('a\n', 'a.zzy').fallback?.detail).toBe('short: 0 kinds for 1 lines')
    expect(broken.scan('a\n', 'a.zzz').fallback?.detail).toBe('odd: not a content kind: code')
    expect(broken.scan('a\n', 'a.ts')).toMatchObject({
      name: 'TypeScript',
      reader: 'table',
      fallback: null,
    })
    const failingTs = createScannerRegistry({
      scanners: [scanner('ts-broken', '.ts', () => [])],
    }).scan("import a from 'a'\n// note\n", 'a.ts')
    expect(failingTs.kinds).toEqual(['boilerplate', 'comment'])
    expect(failingTs).toMatchObject({ name: 'TypeScript', reader: 'table' })
    expect(failingTs.fallback?.reason).toBe('scanner-failed')
  })

  test('an unknown language uses the one-line rule', () => {
    expect(registry.scan('# note\nvalue\n\n', 'notes.unknownext')).toEqual({
      name: null,
      category: null,
      kinds: ['comment', 'logic', 'blank'],
      reader: 'one-line',
      fallback: { reason: 'unknown-language', detail: 'notes.unknownext' },
    })
    expect(registry.languageOf('notes.unknownext')).toEqual({ name: null, category: null })
  })
})

describe('lexing hazards', () => {
  test('a regex literal hides comment and quote openers', () => {
    expectScan(
      'src/r.ts',
      `
      L const t = p.replace(/\\/*$/, '')
      L const c = /[/*]/.test(s) && /\\\`/.test(s)
      C // still a comment
      L const half = a / b / c // division, then a comment
      `,
    )
  })

  test('strings that cross lines, where the language allows it', () => {
    expectScan(
      'run.sh',
      `
      L echo "usage:
      L   # not a comment
      L "
      C # a comment
      `,
    )
    expectScan(
      'src/lib.rs',
      `
      L let css = "
      L   body { margin: 0 } /* reset
      L ";
      L let quote = '"';
      L fn f<'a>(x: &'a str) {}
      C // real comment
      `,
    )
  })

  test('C++ raw strings, Kotlin raw strings and Haskell strings', () => {
    expectScan(
      'a.cpp',
      `
      L auto j = R"json({"a": 1})json";
      C // comment
      `,
    )
    expectScan(
      'a.kt',
      `
      L val dir = """C:\\"""
      C // comment
      `,
    )
    expectScan(
      'a.hs',
      `
      L openComment = string "{-"
      C -- a comment
      L main = pure ()
      `,
    )
  })

  test('C character literals and CSS single-quoted strings', () => {
    expectScan(
      'a.c',
      `
      L char q = '"'; /* a quote
      C still the comment */
      `,
    )
    expectScan(
      'a.scss',
      `
      L a::before { content: '/*'; }
      L b { color: red; }
      `,
    )
  })

  test('JSX single quotes and {/* */} comments', () => {
    expectScan(
      'a.jsx',
      `
      L const g = 'src/*'
      L function f() {}
      C   {/* TODO: remove this */}
      `,
    )
  })

  test('imports inside a multi-line string are not boilerplate, a call argument is no docstring', () => {
    expectScan(
      'gen.ts',
      `
      L const src = \`
      L import { a } from "b"
      L \`
      `,
    )
    expectScan(
      'q.py',
      `
      L cursor.execute(
      L     """
      L     SELECT 1
      L     """,
      B )
      `,
    )
  })

  test('a byte-order mark does not hide the first line', () => {
    const scan = registry.scan(
      '\uFEFF// Copyright (c) 2024 Acme. All rights reserved.\nint x;\n',
      'a.cs',
    )
    expect(scan.kinds).toEqual(['boilerplate', 'logic'])
    expect(registry.scan('\uFEFF#!/bin/sh\necho\n', 'bin/run').name).toBe('Shell')
  })

  test('C# raw strings close on as many quotes as opened them; verbatim strings double theirs', () => {
    expectScan(
      'a.cs',
      `
      L var s = """" a """ b """";
      C // after a four-quote raw string
      L var q = @"""""";
      C // after a verbatim string of two quotes
      L var r = @"x """"";
      C // after a verbatim string ending in a quote
      L var t = $$"""
      L   // inside a raw string
      L   """;
      C // after it
      L var u = @$"a {x}
      L   // inside an interpolated verbatim string
      L ";
      C // after it
      `,
    )
  })

  test('a backtick in Kotlin or Scala ends with its line', () => {
    expectScan(
      'a.kt',
      `
      L val s = "\${"\`"}x"
      C // after a backtick inside an interpolation
      L fun \`a name\`() {}
      C // after a backtick name
      `,
    )
    expectScan(
      'a.scala',
      `
      L val x = <p>it\`s</p>
      C // after a stray backtick
      `,
    )
  })

  test('JSON with comments, by name', () => {
    expectScan(
      'tsconfig.build.json',
      `
      B {
      C   // "outDir": "./dist",
      L   "strict": true
      B }
      `,
    )
  })

  test('Markdown: a comment opener in prose or a fence is text', () => {
    expectScan(
      'README.md',
      `
      D Start a comment with \`<!--\` and end it later.
      D \`\`\`html
      D <!-- an example -->
      D \`\`\`
      C <!-- a real comment -->
      D ## Usage
      `,
    )
  })

  test('statement-start patterns do not swallow bodies', () => {
    expectScan(
      'a.php',
      `
      L <?php if ($user) { ?>
      L <p>Hi</p>
      L <?php } ?>
      `,
    )
    expectScan(
      'a.scala',
      `
      L package object util {
      L   def twice(x: Int) = x * 2
      B }
      `,
    )
  })

  test('doc comments that mention a licence stay docs; prose is never a licence header', () => {
    expectScan(
      'src/lib.rs',
      `
      D //! Crate docs.
      D //! ## License
      D //! Licensed under either of Apache-2.0 or MIT.
      L pub fn f() {}
      `,
    )
    expectScan(
      'NOTES.md',
      `
      D Copyright 2024 Acme, licensed under MIT.
      `,
    )
  })
})

describe('table limits found against tree-sitter', () => {
  test('Ruby: a regular expression may hold quotes and `#`, and may cross lines', () => {
    // net/imap: a regex of a space, then one holding a backtick and a quote.
    expectScan(
      'a.rb',
      `
      L SP = / /n
      L OCTET = /[\\x00-\\xFF]/n # not using /./m
      L break if /\`__send__'$/ =~ x
      C # a comment
      `,
    )
    // A /x regex that does not close on its line holds a quote of its own.
    expectScan(
      'a.rb',
      `
      L METHOD = /(
      L   [\\w"]+ | ' | \\#{x}
      L )/x
      C # a comment
      `,
    )
  })

  test('Ruby: percent literals hold quotes and `#`; their brackets nest', () => {
    // rdoc's parser/c.rb: %r with % as its delimiter, across lines.
    expectScan(
      'a.rb',
      `
      L @content.scan(%r%rb_define_attr\\(
      L   \\s*"([^"]+)",
      L %xm)
      C # a comment
      L re = %r{a'b{2}'c}
      C # a comment
      `,
    )
    // The closing bracket of a word list is the string's end, as tree-sitter reads it.
    expectScan(
      'a.rb',
      `
      L WORDS = %w[
      L   don't # not a comment
      L ]
      C # a comment
      L half = a % b # modulo, then a comment
      `,
    )
  })

  test("Ruby: `$'`, `?'` and `:/` open no string, regex or comment", () => {
    // `$'` is the text after the last match, and `$"` the list of loaded files.
    expectScan(
      'a.rb',
      `
      L name = $' if name =~ /^::/
      L CGI.escapeHTML($")
      C # a comment
      `,
    )
    // Character literals where an expression may start; after a value `?` is a ternary.
    expectScan(
      'a.rb',
      `
      L in ?'
      L dir.chomp(?/)
      L q = s.include?('"')?"'":'"'
      L memberwise(:/, x)
      C # a comment
      `,
    )
  })

  test('Ruby: interpolation holds code, which may hold strings', () => {
    expectScan(
      'a.rb',
      `
      L s = "#{x ? "'" : ''} # not a comment"
      C # a comment
      `,
    )
  })

  test('Ruby: a heredoc may open anywhere on a line, with any quoted word, two at a time', () => {
    expectScan(
      'a.rb',
      `
      L class_eval <<-'end;', __FILE__, __LINE__ + 1
      L   # it's text, not a comment
      L end;
      C # a comment
      L foo(<<~EOS, <<~TWO)
      L   don't
      L EOS
      L   won't
      L TWO
      C # a comment
      `,
    )
    // Right after a value, << shifts.
    expectScan(
      'a.rb',
      `
      L mask = 1<<BITS
      C # a comment
      `,
    )
  })

  test("Ruby: `=begin` and `=end` count only at a line's start", () => {
    expectScan(
      'a.rb',
      `
      C =begin
      C   parse(["=begin\\n", "=end\\n"])
      C =end
      L puts "out"
      `,
    )
  })

  test('shells: `$(…)` and `${…}` inside double quotes hold code with quotes of its own', () => {
    // packages/ts/story-harness/src/local/story-shots-local.sh: its comments read as logic
    // unless the quotes inside `"$(…)"` nest.
    expectScan(
      'story-shots-local.sh',
      `
      L WORK="\${STORY_SHOTS_WORK:-$HOME/.cache/story-shots/$(basename "$SRC")-$(printf %s "$SRC" | cksum | cut -d' ' -f1)}"
      L BUN_VERSION="$(sed -n 's/.*"packageManager": *"bun@\\([^"]*\\)".*/\\1/p' "$SRC/package.json")"
      _
      C # Capture before use, so a failing plan.mjs aborts instead of feeding nothing.
      L mkdir -p "$WORK"
      C # Git's own file list: tracked and untracked-not-ignored files that exist on
      L x="\${y:-"a b"}"
      C # a comment
      `,
    )
  })

  test("shells: a single quote holds no escape, `$'…'` does, and a backslash escapes outside quotes", () => {
    // libtool's ltmain.sh
    expectScan(
      'a.sh',
      `
      L IFS='\\'
      L x='a\\\\b'
      C # a comment
      L s=$'it\\'s'
      L echo It\\'s
      C # a comment
      `,
    )
  })

  test('shells: `#` opens a comment only where a word may start', () => {
    expectScan(
      'a.zsh',
      `
      L url=http://x/#frag; echo 'one
      L two'
      L n=\${#arr[@]} # a trailing comment
      C # a comment
      `,
    )
  })

  test('shells: `<<\\EOF` quotes a heredoc word; `<<<` is a here-string', () => {
    expectScan(
      'a.ksh',
      `
      L cat <<\\EOF
      L it's
      L EOF
      C # a comment
      L read -r a <<< word
      C # a comment
      `,
    )
  })

  test('PHP 8: a `#[…]` attribute is code, a `#` comment is not', () => {
    expectScan(
      'a.php',
      `
      B <?php
      L #[\\ReturnTypeWillChange]
      L #[AsCommand(name: '|_complete', description: 'x')]
      C # a comment
      `,
    )
  })

  test('Java: annotations on a `package` line are part of that boilerplate', () => {
    expectScan(
      'com/acme/package-info.java',
      `
      D /** Utilities. */
      B @CheckReturnValue
      B @ParametersAreNonnullByDefault
      B package com.acme;
      _
      B import java.util.List;
      _
      L @Override
      L public int x() { return 1; }
      `,
    )
  })
})

describe('splitLines', () => {
  test('counts lines as git does', () => {
    expect(splitLines('')).toEqual([])
    expect(splitLines('a')).toEqual(['a'])
    expect(splitLines('a\n')).toEqual(['a'])
    expect(splitLines('a\r\nb\r\n')).toEqual(['a', 'b'])
    expect(splitLines('\n\n')).toEqual(['', ''])
  })
})

describe('second-review hazards', () => {
  test('a template literal holds code in ${…}, which may hold templates and regex-looking text', () => {
    expectScan(
      'src/t.ts',
      `
      L const msg = \`is \${o ? \`\${o.owner}/\${o.repo}\` : 'none'}, not \${d.owner}/\${d.repo}\`
      C // a comment
      D /** a doc */
      L const list = \`\${xs.map((v) => \`- \\\`\${v}\\\`\`).join('\\n')}\`
      C // another
      `,
    )
  })

  test('heredoc text is a string, whatever quotes it holds', () => {
    expectScan(
      'run.sh',
      `
      L cat <<EOF
      L Don't pass both flags.
      L EOF
      C # Parse arguments.
      `,
    )
    expectScan(
      'a.rb',
      `
      L msg = <<~TXT
      L   Don't do it
      L TXT
      C # a comment
      `,
    )
    expectScan(
      'a.php',
      `
      L $t = <<<EOT
      L It's here
      L EOT;
      C // a comment
      `,
    )
  })

  test('a Markdown fence closes only on a fence like the one that opened it', () => {
    expectScan(
      'a.md',
      `
      D \`\`\`\`md
      D \`\`\`
      D <!-- inside -->
      D \`\`\`\`
      C <!-- outside -->
      `,
    )
  })

  test('a licence in Markdown or text is legal text', () => {
    expect(registry.scan('# MIT License\n', 'LICENSE.md').name).toBe('License')
    expect(registry.scan('Apache\n', 'pkg/LICENSE-APACHE.txt').name).toBe('License')
  })
})

describe('the one-line rule', () => {
  test('a line is a comment when it starts with an opener', () => {
    expect(prefixKind('  // note')).toBe('comment')
    expect(prefixKind('# note')).toBe('comment')
    expect(prefixKind('<!-- note -->')).toBe('comment')
    expect(prefixKind('code() // note')).toBe('logic')
    expect(prefixKind('   ')).toBe('blank')
    expect(prefixKind('\t')).toBe('blank')
  })

  test('languages by name', () => {
    expect(languageNamed('Rust')?.category).toBe('programming')
    expect(languageNamed('Markdown')?.category).toBe('prose')
    expect(languageNamed('nope')).toBeNull()
  })
})

test('a Markdown fence is up to three spaces in; a tab-indented one is indented code, as CommonMark says', () => {
  const kinds = (text: string) => createScannerRegistry().scan(text, 'a.md').kinds
  // Inside a fence an HTML comment is text; outside one it is a comment.
  expect(kinds('   ```\n<!-- x -->\n')).toEqual(['doc', 'doc'])
  expect(kinds('\t```\n<!-- x -->\n')).toEqual(['doc', 'comment'])
})

test("prefixKind with a language reads that language's comment markers", () => {
  const erlang = languageNamed('Erlang')
  const c = languageNamed('C')
  expect(prefixKind('  % a note', erlang)).toBe('comment')
  expect(prefixKind('  % a note')).toBe('logic')
  expect(prefixKind('#define LIMIT 4', c)).toBe('logic')
  expect(prefixKind('#define LIMIT 4')).toBe('comment')
  expect(prefixKind(' * a doc line', c)).toBe('comment')
  expect(prefixKind('', c)).toBe('blank')
})

test('prefixKind reads a letter marker only as a whole word, and a one-letter marker only at column 1', () => {
  const fortran = languageNamed('FORTRAN Legacy')
  const batch = languageNamed('Batch')
  expect(prefixKind('      call foo(x)', fortran)).toBe('logic')
  expect(prefixKind('c a comment', fortran)).toBe('comment')
  expect(prefixKind('C', fortran)).toBe('comment')
  expect(prefixKind('  c indented', fortran)).toBe('logic')
  expect(prefixKind('C*********', fortran)).toBe('comment')
  expect(prefixKind('c-------', fortran)).toBe('comment')
  expect(prefixKind('* a starred comment', fortran)).toBe('comment')
  expect(prefixKind('     *    + b', fortran)).toBe('logic')
  expect(prefixKind('      ! a free-form note', fortran)).toBe('comment')
  expect(prefixKind('REMOVE=1', batch)).toBe('logic')
  expect(prefixKind('REM note', batch)).toBe('comment')
  expect(prefixKind('  REM', batch)).toBe('comment')
  // The table lists only `REM`, and the lexer matches it as written.
  expect(prefixKind('rem note', batch)).toBe('logic')
})

test('prefixKind reads a `*` line as a block-comment middle only where the block opens with `/*`', () => {
  expect(prefixKind('  * 2', languageNamed('OCaml'))).toBe('logic')
  expect(prefixKind('  * a doc line', languageNamed('Java'))).toBe('comment')
})

test('a word marker stands as a word on both sides, punctuation and all', () => {
  const kinds = (text: string, path: string) => createScannerRegistry().scan(text, path).kinds
  const autoconf = languageNamed('Autoconf')
  const batch = languageNamed('Batch')
  expect(kinds('dnl ----\ndnl---\ndnl#x\ndnlx\n', 'configure.in')).toEqual([
    'comment',
    'comment',
    'comment',
    'logic',
  ])
  expect(kinds('REM.\nREM: x\nREMOVE=1\n', 'a.bat')).toEqual(['comment', 'comment', 'logic'])
  expect(prefixKind('dnl---', autoconf)).toBe('comment')
  expect(prefixKind('REM.', batch)).toBe('comment')
  expect(prefixKind('REMOVE=1', batch)).toBe('logic')
})

test('wenyan comment markers open before its punctuation', () => {
  expect(createScannerRegistry().scan('注曰。「「文言備矣」」。\n', 'a.wy').kinds).toEqual([
    'comment',
  ])
})

test('ABAP reads `*` as a comment only in column 1', () => {
  const abap = languageNamed('ABAP')
  expect(prefixKind('* a comment', abap)).toBe('comment')
  expect(prefixKind('         * b.', abap)).toBe('logic')
  expect(createScannerRegistry().scan('* note\n  x = a * b.\n', 'z.abap').kinds).toEqual([
    'comment',
    'logic',
  ])
})

test('the table reads fixed-form FORTRAN and Batch markers as prefixKind does', () => {
  const kinds = (text: string, path: string) => createScannerRegistry().scan(text, path).kinds
  expect(
    kinds('C**** banner\n      call foo(x)\n      x = a + c\n     *    + b\nc note\n', 'm.f'),
  ).toEqual(['comment', 'logic', 'logic', 'logic', 'comment'])
  expect(kinds('REM a note\nREMOVE=1\nset X=1 REM not here\n', 'run.bat')).toEqual([
    'comment',
    'logic',
    'logic',
  ])
})
