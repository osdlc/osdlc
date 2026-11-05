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
- `../../src/beta/`: the schema (`schema.ts`), the validator (`validate.ts`) and its tests.
- `../../schema/beta/harness.schema.json`: the JSON Schema, generated from `schema.ts`.

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
pnpm run validate:beta       # check every file and that schema/beta/harness.schema.json is current
pnpm run write-schema:beta   # rewrite schema/beta/harness.schema.json after changing src/beta/schema.ts
pnpm run check               # every corpus: validate, test, typecheck, generate
```

The validator checks each file's frontmatter against the schema, that `successor` and `fork_of`
name harnesses that exist, and that the body is not empty.
