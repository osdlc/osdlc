# The plan as records

This folder holds the plan's tasks, milestones and decisions, and the components the plan changes.
Each one is a record: a Markdown file whose frontmatter holds its fields and whose body holds its
prose. The folder is a [corpus-schema](../../../packages/conformance/corpus-schema/SPEC.md) corpus at
level 2. That means each type folder holds a JSON Schema, and a validator checks every record
against it.

The [Markdown Ecosystem Plan](ecosystem-plan.md) explains the why. These records are the what
and the when. [BEELINE.md](BEELINE.md) is the shortest path to the work in hand, with a checklist
built from the records, and says how to keep them current.

## The types

Each folder below is a type. Its `<type>.schema.md` file lists the fields a record has, and says
what each one means.

Tasks, milestones and decisions build on the
[planning profile](profile/README.md), a corpus with only types. The root file
names it under `extends` with the prefix `plan`. Tasks and milestones add fields, so each has a
schema that names its profile type with `x-extends`, such as `x-extends: plan/tasks`. Decisions add
none, so `uses: [plan/decisions]` in the root file gives the `decisions/` folder the profile's type,
with no schema file. A record passes the local schema and the profile's. The other types are this plan's own, because they describe this ecosystem.

- [tasks](tasks/tasks.schema.md): one piece of work. The file name is the task number and a short
  name, such as `27 Org corpora.md`. The body is the task's plan. It adds `detail`, `type` and
  `prs` to the profile's task.
- [milestones](milestones/milestones.schema.md): a goal that a group of tasks reaches. The body is
  the goal. It adds `phase` and `beeline` to the profile's milestone. `phase` says which part of
  the ecosystem it builds: the store, the model above it, or harness knowledge. The profile's
  [milestone schema](profile/milestones/milestones.schema.md) says how a
  milestone's status follows from its tasks.
- [decisions](decisions/): a choice the plan made, or one still open. The body states it and why.
  It is the profile's [decision type](profile/decisions/decisions.schema.md), as it
  is, through `uses`.
- [components](components/components.schema.md): a package, crate, spec, profile, corpus or app,
  where it lives today (`present`) and in the plan's end state (`target`), and what it depends on.
  The body is its purpose, then a `## Notes` list.
- [layers](layers/layers.schema.md): a layer of the [architecture](../../architecture/markdown-target.md). Each
  component sits in one.
- [repos](repos/repos.schema.md): a repository that holds components.
- [overlaps](overlaps/overlaps.schema.md): two components that do some of the same job.
- [datasets](datasets/datasets.schema.md): the date the facts were checked, and their sources.

A field that links to another record is a relative Markdown link, such as
`"[9 Extends](9%20Extends.md)"`. A space in a path is written `%20`. The schema marks such a field
with `x-ref`, and the validator checks that it points at a record of the right type.

## Add a task

1. Pick the next free number. Copy a task file and name the copy `<number> <short name>.md`.
2. Fill in the fields that [tasks.schema.md](tasks/tasks.schema.md) and the profile's
   [task schema](profile/tasks/tasks.schema.md) list. `after` holds the tasks it
   waits on, and `prs` the pull requests that do it.
3. Write the plan in the body: what the task does, and what it waits on.
4. Add a link to the task under `tasks` in its milestone's record, at the point where the work
   comes.
5. If the task changes a component, add a link to the task under that component's `tasks`.

## Add a component

1. Copy a component file. Name the copy with a short, lower-case id, such as `markdown-link.md`.
   The id is how other records and the explorer refer to it. Avoid ids that end in `.corpus-schema`: a file
   called `<name>.corpus-schema.md` would start a new corpus.
2. Fill in the fields that [components.schema.md](components/components.schema.md) lists. Set
   `repo_present` and `path_present` if it exists today, and `repo_target` and `path_target` if it
   exists in the target.
3. List what it depends on. Each kind of edge has three fields: `depends` for both states,
   `depends_new` for the target only, and `depends_going` for today only. The same goes for
   `dev_depends`, `implements`, `extends`, `validates` and `reads`.
4. For a twin, the same library in Rust and TypeScript, set `twin` on both records.
5. Write its purpose in the body, and any short facts under `## Notes`.

To record that two components do some of the same job, add an overlap record named
`<from> overlaps <to>.md`.

## Check and build

The plan uses `extends`, which the `@osdlc/corpus-schema` on npm does not know yet. So it is
checked with this repo's own corpus-schema, in `packages/ts/corpus-schema/`. Build it, then
validate the folder, from the repo root. `validate-strict.sh` fails on a warning as well as an
error:

```sh
sh tools/build-corpus-schema.sh
sh tools/validate-strict.sh docs/planning profiles/planning
```

The plan's report includes the profile's errors, but not its warnings, so the command names both
folders.

The explorer's data, `tools/explorer/data/ecosystem.json` and `plan.json`, and the checklist in
[BEELINE.md](BEELINE.md) are built from these records. The explorer links to the same built
corpus-schema. After you change a record, run this in `tools/explorer/` and commit the output with
it:

```sh
pnpm build-data
```

It also checks the rules the validator can't, such as a task missing from its milestone. CI runs
both checks, and fails when the committed JSON or checklist differs from what the records build.
