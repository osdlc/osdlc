# Harness reference

A versioned, cited record of how coding-agent harnesses differ: where they read skills and
instructions, how skills are named and called, which frontmatter fields they honour, their plugin,
hook and MCP formats, and their CLI session surface. Every value has a date and a source.

The record is one [corpus-schema](https://github.com/osdlc/osdlc/blob/main/packages/conformance/corpus-schema/SPEC.md)
corpus.

- `corpus/`: a claims corpus of harnesses, documents, methods, study results, subjects and
  statements. The package has one corpus, so it is not under `corpora/<name>/`. Each type's
  schema is a hand-written JSON Schema in its folder, such as
  `corpus/statements/statements.schema.md`. See [corpus/README.md](corpus/README.md).
- `corpus/notes/`: research notes the corpus cites. They are narrative files, not records.
  Upstream docs and repositories are cited by their own URLs.
- `probes/`: reproducible runs that back `run` study results. Five of the seven are also held as
  methods in the corpus (`pi-package-install` and the fixtures it ships are copied there);
  `plugin-layout` and `skill-symlink` are not. `probes/` is not validated.
- `src/corpus/`: `capture`, which writes study results from a fetched page; `lint`, the rules that
  compare records; and tests. The corpus is checked by the
  [`@osdlc/corpus-schema`](https://www.npmjs.com/package/@osdlc/corpus-schema) validator, a
  published package.
- `src/compile/`: `compile`, which reads the corpus and writes `dist/harness-knowledge.json`, and
  `lookup`, which reads that file. See [The compiled file](#the-compiled-file).

## Probes

A probe is a run anyone can repeat: `probes/<id>/probe.md`, plus an optional `fixture/` folder of
the files the run needs. Probes sit outside `corpus/`, so a fixture's own Markdown is never read as
a record. A run is a study result that links its method. `probes/` is not validated.

## Checking it

Node 24 runs the TypeScript in `src/` directly. From this folder:

```sh
pnpm run validate       # corpus-schema validate corpus
pnpm run lint           # the rules that compare records (values, scopes, supersedes)
pnpm run test           # every src/*/*.test.ts
pnpm run typecheck
pnpm run check          # validate, lint, test and typecheck
pnpm run capture ...    # write a study result; see corpus/README.md
pnpm run compile        # write dist/harness-knowledge.json and its schema (not committed)
```

CI runs `pnpm run check` when anything under `harness-reference/`, the workflow file
(`.github/workflows/harness-reference.yml`) or `pnpm-lock.yaml` changes.

## The compiled file

`pnpm run compile` reads the corpus and writes two files to `dist/`, which is not committed:

- `harness-knowledge.json`: the harnesses, the subjects with their `valueSchema`, and one entry per
  `current` or `disputed` statement: the value, its scope, its strength and a `basis` permalink to
  the statement at a commit. Evidence, study results and documents stay in the corpus.
- `harness-knowledge.schema.json`: the JSON Schema of that file.

`--commit <sha>` sets the commit the permalinks point at; it defaults to `git rev-parse HEAD`.
`--no-schema` skips the schema file. `--slice <file>` keeps only the harnesses and subjects the
JSON file lists, drops `valueSchema`, writes compact JSON and no schema file; `pnpm run
compile:embed` uses it to write the copy tradecraft-core embeds.
`compile` refuses a corpus that fails validation or lint.

`lookup(knowledge, harness, subject, { version, platform, model, accept })` in
`src/compile/lookup.ts` returns `{ value, strength, basis, disputed }` or `undefined`. `since` is
inclusive and `until` exclusive; semver versions compare by precedence and dates as strings. With
no version it takes the value with `until: null`. An empty `platform` or a null `model` fits any
query; the narrowest scope wins, and two equally narrow values throw `AmbiguousValue`. Weak and
disputed values are skipped unless `accept` allows them.

## Correcting a fact

See [Adding a harness](corpus/README.md#adding-a-harness) and
[Recording a study result](corpus/README.md#recording-a-study-result). A fact changes by a new
study result and a new or edited statement, never by editing a study result.

A new subject needs its `subjects/` record first.
