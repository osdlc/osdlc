# Harness reference

A versioned, cited record of how coding-agent harnesses differ: where they read skills and
instructions, how skills are named and called, which frontmatter fields they honour, their plugin,
hook and MCP formats, and their CLI session surface. Every value has a date and a source. A small
generator turns the record into static HTML pages.

The record is kept in `corpora/`: `alpha`, a frozen OKF bundle with its own validator, and `beta`,
a [markdown-db](../docs/standards/S-GFFY-markdown-db.md) corpus.

- `corpora/alpha/`: the alpha corpus, the first prototype. It is frozen: only fixes to links, paths
  and wrong values go in. New research goes into a later corpus.
- `corpora/alpha/sources/`: research notes the alpha corpus cites. Upstream docs and repositories
  are cited by their own URLs.
- `corpora/beta/`: the beta corpus, built up step by step. Step one is one file per harness. Its
  schema is a hand-written JSON Schema in `corpora/beta/harnesses/harnesses.schema.md`. See
  [corpora/beta/README.md](corpora/beta/README.md).
- `probes/`: reproducible runs that back `evidence: run` observations.
- `src/alpha/`: the alpha schema, validator, page generator and tests.
- `schema/alpha/`: JSON Schemas generated from `src/alpha/schema.ts`, for other tools.
- `src/markdown-db/`: the validator for any corpus that follows
  [markdown-db](../docs/standards/S-GFFY-markdown-db.md), the beta corpus's format.

## The alpha corpus

`corpora/alpha/` is an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
(OKF) **v0.2** bundle: a folder of Markdown files with YAML frontmatter, one concept per file. The
root `index.md` declares `okf_version: "0.2"`.

| Concept                         | Path                                  | `type`                  |
| ------------------------------- | ------------------------------------- | ----------------------- |
| Harness or standard             | `harnesses/<id>.md`                   | `Harness` or `Standard` |
| Subject category                | `categories/<id>.md`                  | `Subject Category`      |
| Subject (a comparison row)      | `subjects/<category>/<name>.md`       | `Subject`               |
| Fact (one harness, one subject) | `facts/<harness>/<category>/<name>.md` | `Harness Fact`          |
| Probe (a reproducible run)      | `../probes/<id>/probe.md`             | `Harness Probe`         |

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
    via: skill-naming # the note in corpora/alpha/sources/ that recorded an upstream source
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
- Observations made on one date, still in force and with the same `model` are parts of one answer,
  so each answers its own keys. Merge two parts that answer the same key, or give them distinct keys.
- `open` lists questions the sources leave unresolved. A fact may hold only open questions.
- `evidence: run` needs a `probe`, the id of a folder under `probes/` whose `probe.md` lists the
  fact's harness and subject, and a `checked_version`. `probe` is refused on any other evidence.
- `model` names the model an observation was made with. It is allowed only on subjects whose
  concept sets `model_dependent: true`: those where the model matters as much as the harness, such
  as picking a skill from its description (`skills/description-match`) and following a relative
  path in SKILL.md (`skills/relative-paths`).
- `checked_version`, `locator`, `model` and `note` are optional.

### Paths in values

A path in a `value` is data, not a quote, so one location is spelled one way:

- A project path is relative to the project root: `.agents/skills`, not `./.agents/skills`,
  `<proj>/.agents/skills` or `<project>/.agents/skills`.
- A home path starts with `~/`: `~/.agents/skills`, not `$HOME/.agents/skills` or
  `<home>/.agents/skills`.
- No trailing slash: `.claude/rules`, not `.claude/rules/`.
- `$VAR` stays only where the harness itself names a variable, such as `$CODEX_HOME`,
  `$DSH_HOME` or `$CWD` in a walk. `$HOME` is the exception: it is always written `~`.
- A placeholder with its own meaning stays: `<repo_root>/`, and `<cwd>/` for a path read only in
  the directory the harness starts in, which can be below the project root.
- A setting that lists directories is not a directory. It gets its own key, such as
  `dirs_setting`.

The validator flags a trailing slash, a leading `./`, a `<proj>/`, `<project>/` or `<home>/`
prefix, and `$HOME`, on any word in a value string that starts with `.`, `~`, `$` or `<`
and holds a `/`. Strings under a `commands` key are shell and keep their own spelling. Quotes in a
fact's body keep the source's spelling.

The Markdown body explains the fact in prose, with footnotes keyed to `sources` ids (OKF §5.1). The
generator reads only frontmatter.

OKF has no notion of a value that changes across versions. The observations list is this corpus's
own frontmatter extension, which OKF allows (§4.1). OKF `log.md` files are not used, and nothing
sets `generated` or `verified`, so OKF consumers read every concept as unverified.

## Probes

A probe is a run anyone can repeat: `probes/<id>/probe.md`, plus an optional `fixture/` folder of
the files the run needs. Probes sit outside `corpora/`, so a fixture's own Markdown is never read as
a concept. The frontmatter holds:

| Key         | Holds                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| `type`      | `Harness Probe`                                                          |
| `subjects`  | The subjects a run answers                                               |
| `harnesses` | The harnesses it runs on                                                 |
| `commands`  | Shell steps per harness, run from the probe folder                       |
| `record`    | What to write down from a run                                            |
| `safety`    | What a run touches beyond the probe folder, such as account-wide state   |

Every path in a command is relative to the probe folder. The validator refuses a command that
names a home directory (`/Users/`, `/home/`, `~/` or `$HOME`), a subject or harness with no concept, and a harness with no commands.

To record a run, add an observation with `evidence: run`, `probe: <id>`, the `checked_version` the
run used, and `model` where the subject allows it.

## Checking it

Node 24 runs the TypeScript in `src/` directly. From this folder:

```sh
pnpm run validate       # check both corpora, alpha's links into this repository, and schema/alpha/*.json
pnpm run test           # validator and renderer tests
pnpm run typecheck
pnpm run generate       # write the alpha pages to dist/ (not committed)
pnpm run check          # all four
pnpm run write-schema   # rewrite schema/alpha/*.json after changing src/alpha/schema.ts
```

CI runs `pnpm run check` when anything under `harness-reference/` changes
(`.github/workflows/harness-reference.yml`).

`generate` writes `index.html` (the current state, one table per category; each cell lists every
observation still in force), a page per harness and
per subject, a page per probe under `probes/` (linked from the observations it backs),
`changes.html` (every observation by date), `gaps.html` (open questions and cells with no
observation in force) and `data.json` (the whole corpus).

## Correcting an alpha fact

1. Open `corpora/alpha/facts/<harness>/<category>/<name>.md`, or copy a sibling.
2. Append the observation and keep the list oldest first. Add any new source to `sources`. Cite a
   public URL; if the source is a note of your own, add it under `corpora/alpha/sources/` and cite its GitHub URL.
3. Add a line to the body's `## Observations` list with its footnote.
4. Run `pnpm run check`.

A new subject needs its `subjects/` concept first, with an `order` that places it among its
category's rows.
