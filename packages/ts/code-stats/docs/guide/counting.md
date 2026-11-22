---
title: Counting
sidebar:
  order: 1
description: Line kinds, languages and file groups, what is counted, and reading with tree-sitter.
---

`code-stats count` gives the lines of a folder or a commit by **kind**, **language** and **file
group**.

```sh
code-stats count                  # everything under this folder
code-stats count src tests        # only these paths
code-stats count --detail         # every language, and a row per file
code-stats count --json           # the report as JSON
code-stats count --rev v1.0       # a commit instead of the files on disk (needs git)
```

## Line kinds

Every line gets exactly one kind. Here is a file as the scanner reads it:

```text
boilerplate │ import { round } from './money.ts'
boilerplate │ import { TAX_RATE } from './tax.ts'
blank       │
doc         │ /** A line in the cart. */
logic       │ export interface Item {
logic       │   price: number
logic       │   quantity: number
boilerplate │ }
blank       │
comment     │ // Sum before tax, rounded to cents.
logic       │ export function subtotal(items: Item[]): number {
logic       │   return round(items.reduce((n, i) => n + i.price * i.quantity, 0))
boilerplate │ }
```

| Kind | What counts |
| --- | --- |
| `logic` | Everything that is not one of the kinds below. That includes type declarations, and a line holding both code and a trailing comment. |
| `boilerplate` | Imports and re-exports (`import`, `use`, `package`, `#include`, `require`, …), a licence header or SPDX line, a shebang, and lines holding only brackets and separators, such as `}` or `});`. |
| `comment` | A comment that is not documentation. |
| `doc` | Doc comments (`/** … */`, `///`, `//!`, `/*!`), Python docstrings, and the text of prose files such as Markdown. |
| `blank` | Whitespace only. |

Boilerplate is kept narrow on purpose. Telling a getter or a type-only declaration from "real"
logic needs a parser per language and would often be wrong, so those count as logic.

The scanner reads a whole file, not line by line, so it knows when a line is inside a block
comment or a string. A `//` inside a string is not a comment, and a `/*` inside a regex does not
start one.

## Languages

The language comes from the file name, or from a shebang (`#!/usr/bin/env python3`) for a file
with no extension. The table of comment and string syntax for 366 languages is
[scc](https://github.com/boyter/scc)'s, vendored at a pinned version. On top of it, code-stats
adds which comments are doc comments, which lines are imports, and which languages are prose,
data or legal text, and it tells braced SCSS (`.scss`) from the indented Sass (`.sass`), which the
table lumps together.

A file in a language the table does not know falls back to a simple rule: a line starting with a
comment marker (`#`, `//`, `--`, …) is a comment, anything else is logic. The report has a note
when that happens.

## File groups

Each file goes in one group, so that, for example, test code and generated code are not counted
as your source:

| Group | Files |
| --- | --- |
| `source` | Code in a programming language. |
| `tests` | Code under a test path (`tests/`, `__tests__/`, `*.test.ts`, `*_test.go`, …). |
| `docs` | Prose: Markdown, reStructuredText, plain text. |
| `instructions` | Agent instructions (`CLAUDE.md`, `AGENTS.md`, `SKILL.md`, …). Their prose counts as logic, since it steers what agents do. |
| `other` | Config, data and licences. |
| `generated` | Lockfiles, minified files, source maps, snapshots, `*.generated.*`, and files whose first lines say `DO NOT EDIT` or `@generated`. |
| `vendored` | `vendor/`, `third_party/` and `node_modules/`. |

Generated and vendored files are counted by lines only. They are not part of the kind totals,
since nobody wrote them line by line.

The first rule that matches decides:

1. Your globs: `--generated`, `--vendored`, `--instructions`, `--docs` and `--tests`, each taking a
   [picomatch](https://github.com/micromatch/picomatch) pattern.

   ```sh
   code-stats count --generated 'src/api/**' --tests 'e2e/**'
   ```

2. [Linguist attributes](https://github.com/github-linguist/linguist/blob/main/docs/overrides.md)
   in `.gitattributes`, the same ones GitHub reads: `linguist-generated`, `linguist-vendored` and
   `linguist-documentation`. `--no-linguist` ignores them.

   ```gitattributes
   packages/api/src/client/** linguist-generated
   ```

3. The built-in rules in the table above for generated, vendored and instructions files
   (`DEFAULT_RULES` in the library).
4. The language, then the path: prose is docs, even under a test path; anything else under a test
   path is tests; other code is source; and the rest is other.

## What is counted

`count` reads the files on disk, and gives the same result whether or not git is installed. It
leaves out:

- what a `.gitignore` excludes, read from the repository's top down to each file, plus the
  repository's `info/exclude`. Counting `packages/app` therefore leaves out what counting from the
  top would;
- `.git`, `.hg`, `.svn`, `.jj` and `node_modules`;
- symlinks, which are not followed.

Binary files and files over 2 MB are not read or counted. The report lists them under `skipped`,
with the reason, so nothing disappears silently.

In the repository code-stats was developed in, the files `count` lists are exactly those `git ls-files` lists, apart from 8
files committed even though a `.gitignore` matches them. Only git's index knows those were
committed. Use `--rev HEAD` to count exactly what is committed.

## Reading with tree-sitter

`--tree-sitter` reads TypeScript, TSX, JavaScript, Rust, Python, Scala, Go, Java, C, C++, C#,
Ruby, PHP and Bash with a real syntax tree, through
[web-tree-sitter](https://www.npmjs.com/package/web-tree-sitter): the tree-sitter parser compiled
to WebAssembly, so there is nothing to build. It is optional. Install the runtime and the grammars
for the languages you want:

```sh
npm install web-tree-sitter tree-sitter-typescript tree-sitter-python tree-sitter-go tree-sitter-java
code-stats count --tree-sitter
```

The grammar packages are `tree-sitter-typescript` (TypeScript and TSX), `tree-sitter-javascript`,
`tree-sitter-rust`, `tree-sitter-python`, `tree-sitter-scala`, `tree-sitter-go`,
`tree-sitter-java`, `tree-sitter-c` (`.c` and `.h`), `tree-sitter-cpp`, `tree-sitter-c-sharp`,
`tree-sitter-ruby`, `tree-sitter-php` (PHP and the HTML around it) and `tree-sitter-bash` (`.sh`
and `.bash` files). Each ships its grammar as a `.wasm` file, which is what is read.

A language whose grammar is not installed is read by the table as usual, and the command says which
ones those were. The two readings almost always agree: across 1.5 million lines in that repository,
they differ on 8. Elsewhere they differ on none of 1.2 million lines of Go's standard library,
190,000 of Java, 100,000 of PHP, 43,000 of shell scripts or 10,000 of C#; on 4 of 4.2 million lines
of Python libraries, 150 of 1.1 million lines of C (comments inside macros), 7 of 290,000 of C++,
and 24 of 390,000 of Ruby (mostly a `}` followed by a line continuation, which tree-sitter counts as
punctuation). The table therefore stays the default. Tree-sitter is mainly for adding a language the
table reads poorly; see [Library](./library.md#add-a-language).
