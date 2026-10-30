# Harness reference

A versioned, cited record of how coding-agent harnesses differ: where they read skills and
instructions, how skills are named and called, which frontmatter fields they honour, their plugin,
hook and MCP formats, and their CLI session surface. Every value has a date and a source. A small
generator turns the record into static HTML pages.

- `bundle/`: the data.
- `sources/`: research notes the bundle cites. Upstream docs and repositories are cited by their own
  URLs.
- `src/`: the schema, validator, page generator and tests.
- `schema/`: JSON Schemas generated from `src/schema.ts`, for other tools.

## Format

`bundle/` is an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
(OKF) **v0.2** bundle: a folder of Markdown files with YAML frontmatter, one concept per file. The
root `index.md` declares `okf_version: "0.2"`.

| Concept                         | Path                                  | `type`                  |
| ------------------------------- | ------------------------------------- | ----------------------- |
| Harness or standard             | `harnesses/<id>.md`                   | `Harness` or `Standard` |
| Subject category                | `categories/<id>.md`                  | `Subject Category`      |
| Subject (a comparison row)      | `subjects/<category>/<name>.md`       | `Subject`               |
| Fact (one harness, one subject) | `facts/<harness>/<category>/<name>.md` | `Harness Fact`          |

Ids come from paths, as OKF concept ids do. A fact also names its `harness` and `subject` in
frontmatter, and the validator checks they match the path.

A fact never holds a single value. It holds every dated observation of that value, oldest first:

```yaml
observations:
  - value: { behaviour: prefix doubled in the slash menu }
    since: null # first harness version it holds in; null when no source names one
    until: '2.1.246' # first version it no longer holds in; null while it still holds
    observed: '2026-10-01' # the date the source checked it
    source: claude-changelog # a sources[].id
    via: skill-naming # the note in sources/ that recorded an upstream source
    evidence: changelog # docs | source | help-text | run | changelog | inferred
```

Rules:

- **Never invent a version.** When a source gives none, `since` and `until` stay null and
  `observed` carries the date.
- **Versions follow the harness's `versioning`**: semver, a `YYYY-MM-DD` date for products with no
  release numbers, or `unknown`, which forbids `since` and `until`.
- **Every value traces to a source.** `source` and `via` are ids into the concept's OKF `sources`
  list. Each entry has an `https` `resource`. A file in this repository is cited by its GitHub URL,
  and the validator checks that the file exists.
- `value` is an object. `supported` (`true`, `false` or `"partial"`) is the headline field when one
  applies. Other keys are snake_case and depend on the subject.
- `open` lists questions the sources leave unresolved. A fact may hold only open questions.
- `checked_version`, `locator` and `note` are optional.

The Markdown body explains the fact in prose, with footnotes keyed to `sources` ids (OKF §5.1). The
generator reads only frontmatter.

OKF has no notion of a value that changes across versions. The observations list is this bundle's
own frontmatter extension, which OKF allows (§4.1). OKF `log.md` files are not used, and nothing
sets `generated` or `verified`, so OKF consumers read every concept as unverified.

## Checking it

Node 24 runs the TypeScript in `src/` directly. From this folder:

```sh
pnpm run validate       # check the bundle, its links into this repository, and schema/*.json
pnpm run test           # validator and renderer tests
pnpm run typecheck
pnpm run generate       # write the pages to dist/ (not committed)
pnpm run check          # all four
pnpm run write-schema   # rewrite schema/*.json after changing src/schema.ts
```

CI runs `pnpm run check` when anything under `harness-reference/` changes
(`.github/workflows/harness-reference.yml`).

`generate` writes `index.html` (the current state, one table per category), a page per harness and
per subject, `changes.html` (every observation by date), `gaps.html` (open questions and cells with
no observation in force) and `data.json` (the whole bundle).

## Adding an observation

1. Open `bundle/facts/<harness>/<category>/<name>.md`, or copy a sibling.
2. Append the observation and keep the list oldest first. Add any new source to `sources`. Cite a
   public URL; if the source is a note of your own, add it under `sources/` and cite its GitHub URL.
3. Add a line to the body's `## Observations` list with its footnote.
4. Run `pnpm run check`.

A new subject needs its `subjects/` concept first, with an `order` that places it among its
category's rows.
