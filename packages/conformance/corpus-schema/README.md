# corpus-schema

A format for what a [corpus](../../../docs/terms/corpus.md), a folder of Markdown notes and the
files they link to, can declare about itself. A root file (`<name>.corpus-schema.md`, `.yaml` or
`.json`) marks the folder and names the corpus. Each type is a folder at the corpus root holding
a JSON Schema named after it, and each record is a Markdown, YAML or JSON file in that folder. Links between records are relative Markdown links.

The spec has levels. Level 0 is any folder of linked notes. Level 1 adds the root file, types and
records. Level 2 gives every type a schema. [SPEC.md](SPEC.md) states the format, version 0.

| Implementation                     | Language   | Directory                   |
| ---------------------------------- | ---------- | --------------------------- |
| `@osdlc/corpus-schema` (reference) | TypeScript | `packages/ts/corpus-schema` |

## The suite

`suite.json` holds the cases, and `corpora/` holds one corpus folder for each case. A case names
its corpus in `input.corpus`. Its `expect` holds the `<file>: <field>` prefix of each error and
each warning that validating the corpus reports. An implementation passes when its prefixes match,
as sets, for errors and warnings apart. Message text and order are not compared, because the spec
does not fix them. A case names no code, so a validator in any language can run the same cases.

To add a case, add a corpus folder under `corpora/` and a case naming it in `suite.json`, then run

```sh
pnpm --filter @osdlc/corpus-schema conformance:write
```

to write its `expect`. Never write `expect` by hand.

`corpora/broken` breaks the spec on purpose: a broken link, a bad field, frontmatter that does not
parse.

`corpora/level-*` cover the root file's `level` key, and `corpora/reserved-keys` the reserved keys
`dialect` and `profiles`. `corpora/folder-record-*` cover record folders: a record with a script, a
query and a CSV beside it, a folder with no record file, a record folder inside another, and a
record file in a format the corpus does not allow.

`corpora/extends-*` cover `extends` and `x-extends`, `corpora/references-*` cover `references`,
cross-corpus `x-ref`, the `_references/` copy and identity across corpora, and `corpora/uses*`
cover `uses`. `corpora/identity-*` cover `x-identity`: each case folder is a package, with its own
`package.json`. A case's other corpora sit inside its folder: a nested corpus for a path, and a
package under the case's own `node_modules/` for a package name. The root `.gitignore` keeps
those `node_modules/` folders. The `_references/` copies were written with `corpus-schema sync`.
`references-copy-stale` edits its copy by hand, on purpose.

`corpora/extends-flatten*` cover how `x-extends` merges a chain's fields before a closing keyword.
`corpora/xref-*` cover `x-ref` lists of types and the `id` and `wikilink` forms of `x-ref-form`.
`corpora/root-*` cover the root file's name, `corpora/types-root-only` type folders below the
root, and `corpora/wikilink-*` wikilinks that hold a path, bare names and how far a wikilink
reaches.

Each root file is named after its corpus: the case's folder name, the nested folder's name, or the
package name without its scope for a corpus that is a package.

The `strict` section runs `validate --strict`. Its `expect` adds `passes`, whether the corpus
passes: it has no errors and no warnings. `corpora/strict-*` are its corpora, and so is
`corpora/uses-like-type`, whose only problem is a warning. `corpora/strict-warning` holds one
bare-name wikilink.

The `fix` section runs `validate --fix` on a copy of the case's corpus, so the case's own files do
not change. Its `expect` describes the corpus after the rewrite and adds `fixed`, the files the
rewrite changed. `corpora/fix-*` are its corpora.
