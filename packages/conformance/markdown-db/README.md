# markdown-db

A format for typed records kept as files in a folder. A corpus is a folder with a root file
(`markdown-db.md`, `.yaml` or `.json`). Each type is a folder holding a JSON Schema named after it,
and each record is a Markdown, YAML or JSON file in that folder. Links between records are relative
Markdown links. [SPEC.md](SPEC.md) states the format, version 0.

| Implementation                   | Language   | Directory                 |
| -------------------------------- | ---------- | ------------------------- |
| `@osdlc/markdown-db` (reference) | TypeScript | `packages/ts/markdown-db` |

The spec lives in osdlc while it is young. Once it is stable it moves to a repository of its own,
with this suite and its corpora.

## The suite

`suite.json` holds the cases, and `corpora/` holds one corpus folder for each case. A case names
its corpus in `input.corpus`. Its `expect` holds the `<file>: <field>` prefix of each error and
each warning that validating the corpus reports. An implementation passes when its prefixes match,
as sets, for errors and warnings apart. Message text and order are not compared, because the spec
does not fix them. A case names no code, so a validator in any language can run the same cases.

To add a case, add a corpus folder under `corpora/` and a case naming it in `suite.json`, then run

```sh
pnpm --filter @osdlc/markdown-db conformance:write
```

to write its `expect`. Never write `expect` by hand.

`corpora/broken` breaks the spec on purpose: a broken link, a bad field, frontmatter that does not
parse.
