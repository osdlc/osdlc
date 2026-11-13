# @osdlc/corpus-profile-sdlc

The sdlc profile is the set of record types an sdlc planning corpus uses: principles, standards,
decisions, tasks, milestones, notes and the rest. A repo that keeps its plans as Markdown files can
check them with these types instead of writing its own.

The profile is a corpus that holds types and no records. It ships as the npm package
`@osdlc/corpus-profile-sdlc`. A corpus names it under `extends` in its root file, with the prefix
`sdlc`, and its folders take the profile's types through `uses`. The
[corpus-schema spec](https://github.com/osdlc/markdown/blob/main/packages/conformance/corpus-schema/SPEC.md) defines both.

## Where the types come from

The types are generated, not written by hand. Their source is two packs for `@osdlc/model-schema`,
a library that describes record types once and emits TypeScript, JSON Schema and validators from
them:

- `@osdlc/pack-intent`: principles, standards, decisions, drivers, products, capabilities, terms
  and references.
- `@osdlc/pack-sdlc`: tasks, milestones, backlog, roadmaps, frictions and notes. It requires the
  intent pack.

model-schema's corpus emitter, `model-schema corpus`, writes one type folder per kind into
[corpus/](corpus/). `--inline` puts the intent kinds in the same corpus, so the profile extends
nothing and every reference between two kinds names a local type. [corpus/README.md](corpus/README.md)
lists the types and says what each schema checks.

model-schema and the packs are in a private repo for now, so regenerating the profile is a manual
step. No check here notices when the packs change. That stays so until model-schema and the packs
move to this repo.

## The types

| Folder          | `type:`      | Id            |
| --------------- | ------------ | ------------- |
| `principles/`   | `principle`  | `P-NNNN`      |
| `standards/`    | `standard`   | `S-NNNN`      |
| `decisions/`    | `decision`   | `D-NNNN`      |
| `drivers/`      | `driver`     | `DR-NNNN`     |
| `products/`     | `product`    | `PR-NNNN`     |
| `capabilities/` | `capability` | `C-NNNN`      |
| `terms/`        | `term`       | `TM-NNNN`     |
| `references/`   | `reference`  | `RF-NNNN`     |
| `tasks/`        | `task`       | `T-NNNN`      |
| `milestones/`   | `milestone`  | `M-NNNN(.N)`  |
| `backlog/`      | `backlog`    | `B-NNNN`      |
| `roadmaps/`     | `roadmap`    | `RM-NNNN`     |
| `frictions/`    | `friction`   | `FR-NNNN`     |
| `notes/`        | `note`       | `N-NNNN`      |

`N` is a digit or an upper-case letter. A file is named by its id, such as `P-0002.md`, or by its
id and a slug, such as `P-0002-favor-deterministic.md`. Each type's `x-id-pattern` is the id alone,
and the validator cuts the id out of the file name with it: the longest part that matches, followed
by `-` or the end of the name. A record's `id` field must equal that id.

A decision may also be a folder of its own, `D-0001-a-slug/README.md`, with files of its own beside
`README.md`. The decisions type's `x-record-file: README.md` makes `README.md` the record, with the
folder's id. A `decisions/` folder whose name starts with `_` holds narrative, not records.

Each schema checks the frontmatter: the fields, their types and enums, the lifecycle states, and
the pack rules that JSON Schema can hold. A reference to another record, such as a principle's
`related` or a task's `depends_on`, has `x-ref` with `x-ref-form: wikilink`. Its value is
`"[[P-0002]]"`, and it must name a record of the right type by id.

The profile does not check body sections, defaults, or the relations the packs derive, such as a
decision's inverse links. The packs hold those.

## Install

```sh
pnpm add -D @osdlc/corpus-profile-sdlc
# or
npm install --save-dev @osdlc/corpus-profile-sdlc
```

Install it in the folder that holds your corpus, or in any folder above it. The validator finds the
package the way Node.js does. The package's `"corpus"` field names its corpus folder, `corpus/`.

You need a corpus-schema validator that reads `extends`, `x-ref-form` and lists in `x-ref`:
`@osdlc/corpus-schema` 0.3.0 or later.

## Use it

Name the profile in your corpus's root file, and use its types. `extends` and `uses` need level 2:

```yaml
---
corpus-schema: 0
level: 2
extends:
  sdlc: "@osdlc/corpus-profile-sdlc"
uses: [sdlc/*]
---
```

Each folder at the corpus root named after a type, such as `tasks/`, takes the profile's type as it
is, with no schema file. To add fields to a type, leave it out of `uses`, list the others, and give
its folder a schema file that builds on the profile's type. `tasks/tasks.schema.md`:

```yaml
---
x-extends: sdlc/tasks
---
```

Then validate:

```sh
npx @osdlc/corpus-schema validate --strict docs/planning
```

For shared records, reference the [sdlc starter](../../corpora/sdlc-starter/) corpus and cite its
records.

## Regenerate

From a checkout of the repo that holds model-schema and the packs, which is private for now:

```sh
cd packages/ts/pack-sdlc
bunx model-schema corpus . --inline --out <osdlc/models>/profiles/sdlc/corpus
```

The command owns `corpus/`: it rewrites every file and removes files it did not write. Commit the
result with a changeset.

## Test

From the repository root:

```sh
pnpm install --frozen-lockfile
sh profiles/sdlc/tests/package.sh
```

`tests/package.sh` packs this package and the starter, installs them in a temporary
`node_modules/`, and validates the profile, the starter, broken copies of a starter record, and
[tests/downstream/](tests/downstream/). That corpus extends the profile, references the starter
and cites a starter principle as `[[P-0002]]`, after `sync` writes the starter's copy.
