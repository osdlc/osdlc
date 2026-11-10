# The plan as records

This folder holds the plan's tasks, milestones and decisions, and the components the plan changes.
Each one is a record: a Markdown file whose frontmatter holds its fields and whose body holds its
prose. The folder is a [corpus-schema](../../packages/conformance/corpus-schema/SPEC.md) corpus at
level 2. That means each type folder holds a JSON Schema, and a validator checks every record
against it.

The [ecosystem plan](../ecosystem-plan.md) explains the why. These records are the what and the
when.

## The types

Each folder below is a type. Its `<type>.schema.md` file says which fields a record has.

- [tasks](tasks/tasks.schema.md): one piece of work. The file name is the task number and a short
  name, such as `27 Org corpora.md`. Fields: the number, title, status, type (functional or
  supporting), milestone, and `after`, the tasks that must come first. The body is the task's plan.
- [milestones](milestones/milestones.schema.md): a goal that a group of tasks reaches. The body is
  the goal. `tasks` lists its tasks in the order the work goes. A milestone's status comes from its
  tasks: done when all are done, in progress when any is in progress or done, and not started
  otherwise.
- [decisions](decisions/decisions.schema.md): a choice the plan made, D1 to D12, or one still
  open. The body states it and why.
- [components](components/components.schema.md): a package, crate, spec, profile, corpus or app.
  The fields say where it lives today (`present`) and in the plan's end state (`target`), and what
  it depends on. The body is its purpose, then a `## Notes` list.
- [layers](layers/layers.schema.md): a layer of the [architecture](../architecture.md). Each
  component sits in one.
- [repos](repos/repos.schema.md): a repository that holds components.
- [overlaps](overlaps/overlaps.schema.md): two components that do some of the same job.
- [datasets](datasets/datasets.schema.md): the date the facts were checked, and their sources.

A field that links to another record is a relative Markdown link, such as
`"[9 Extends](9%20Extends.md)"`. A space in a path is written `%20`. The schema marks such a field
with `x-ref`, and the validator checks that it points at a record of the right type.

## Add a task

1. Pick the next free number. Copy a task file and name the copy `<number> <short name>.md`.
2. Set `number`, `title`, `detail`, `status`, `type` and `milestone`. List the tasks it waits on
   under `after`.
3. Write the plan in the body: what the task does, and what it waits on.
4. Add a link to the task under `tasks` in its milestone's record, at the point where the work
   comes.
5. If the task changes a component, add a link to the task under that component's `tasks`.

## Add a component

1. Copy a component file. Name the copy with a short, lower-case id, such as `markdown-link.md`.
   The id is how other records and the explorer refer to it. Avoid `corpus-schema` as an id: a file
   called `corpus-schema.md` would start a new corpus.
2. Set `name`, `kind`, `language`, `layer`, `states` and `status`. Set `repo_present` and
   `path_present` if it exists today, and `repo_target` and `path_target` if it exists in the target.
3. List what it depends on. Each kind of edge has three fields: `depends` for both states,
   `depends_new` for the target only, and `depends_going` for today only. The same goes for
   `dev_depends`, `implements`, `extends`, `validates` and `reads`.
4. For a twin, the same library in Rust and TypeScript, set `twin` on both records.
5. Write its purpose in the body, and any short facts under `## Notes`.

To record that two components do some of the same job, add an overlap record named
`<from> overlaps <to>.md`.

## Check and build

Validate the folder from the repo root:

```sh
npx --yes @osdlc/corpus-schema@^0.2.0 validate docs/planning
```

CI runs the same check. The explorer's data, `ecosystem.json` and `plan.json`, is built from these
records by `tools/explorer/scripts/build-data.mjs`.
