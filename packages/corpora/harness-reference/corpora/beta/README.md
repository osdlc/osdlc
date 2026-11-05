# Beta corpus

A small, plain record of coding-agent harnesses: one Markdown file per harness, checked against a
schema. This is step one. It records only what each harness is. Later steps add questions about
how harnesses behave.

Every value is backed by an upstream page: the vendor's site, docs, repository, license file or
release list. Our own research notes are never the evidence.

## Layout

- `harnesses/<id>.md`: one harness. The id is the filename, in lowercase letters, digits and
  hyphens. YAML frontmatter holds the fields below; the body is two to four plain sentences on what
  it is, who makes it, and anything notable.
- `markdown-db.yaml`: the manifest. It lists the entry types, their path patterns and schemas.
- `schemas/harness.schema.json`: the schema, written by hand. It is the source of truth for the
  fields below. For YAML editor support, put
  `# yaml-language-server: $schema=../schemas/harness.schema.json` on the first line of a
  standalone YAML file. Entries here do not carry it.

The corpus is data only. The format is defined in
[`../../markdown-db/SPEC.md`](../../markdown-db/SPEC.md). Implementations live in
`../../src/markdown-db/`.

## Schema notes

- `x-ref` marks a property whose value is the id of another entry. `"x-ref": "harness"` on
  `successor` and `fork_of` means the value must be the id of an existing harness.
- Beta is not OKF. An entry's type comes from its folder, so entries carry no `type` field. An OKF
  export may come later as a build output.
- `license` is allowed only when `open_source` is true.

## Fields

| Field         | Required | Holds                                                                         |
| ------------- | -------- | ----------------------------------------------------------------------------- |
| `name`        | yes      | Display name, as the vendor writes it                                         |
| `vendor`      | yes      | The company or organization that makes it                                     |
| `homepage`    | yes      | The product's main page                                                       |
| `docs`        | yes      | The start of its user documentation                                           |
| `repository`  | no       | The public source repository; omitted when the source is not public           |
| `license`     | no       | SPDX license id; only set when `open_source` is true                          |
| `open_source` | yes      | Whether its source is published under an open-source license                  |
| `cli`         | no       | The command a user types to start it; omitted when it has no CLI              |
| `surfaces`    | yes      | One or more of `cli`, `ide`, `desktop`, `web`                                 |
| `status`      | yes      | `current`, `sunsetting` or `retired`                                          |
| `successor`   | no       | The harness id the vendor names as its replacement                            |
| `fork_of`     | no       | The harness id it was forked from                                             |
| `versioning`  | yes      | `semver`, `date` or `unknown`, as its releases show                           |
| `checked`     | yes      | The date the entry was last checked against its sources (`YYYY-MM-DD`)        |
| `sources`     | yes      | `{ url, title }` pages that back every value above; at least one              |

A public repository that holds only issues, docs or install scripts is not a source repository, so
`repository` stays unset. When a required value cannot be confirmed, use the honest value (for
`versioning`, `unknown`) and say so in the body.

## Adding a harness

1. Copy a sibling file to `harnesses/<id>.md`.
2. Fill each field from the vendor's own pages, and list every page you used under `sources`.
   Never guess a URL, license or command name; leave an optional field out instead.
3. Set `checked` to today's date and write the body.
4. Run the check.

## Checking it

From `harness-reference/`:

```sh
pnpm run validate:beta   # node src/markdown-db/cli.ts validate corpora/beta
pnpm run check           # every corpus: validate, test, typecheck, generate
```

The validator checks each entry against its schema, that every `x-ref` value names an entry that
exists, and that every file under `harnesses/` matches the path pattern.
