# The planning profile

The planning profile is a set of record types for a plan: tasks, milestones and decisions. A corpus
that keeps its plan as records can build on these types instead of writing its own.

It is a [corpus-schema](../../packages/conformance/corpus-schema/SPEC.md) profile: a level-2
corpus that holds types and no records. Its package name is `@osdlc/corpus-profile-planning`. It
is private for now and not on npm, so a corpus extends it by a path to this folder.

## The types

| Type         | Holds                                        | Id                                  |
| ------------ | -------------------------------------------- | ----------------------------------- |
| `tasks`      | One piece of work.                           | The number, a space, a short name.  |
| `milestones` | A goal that a group of tasks reaches.        | Any id.                             |
| `decisions`  | A choice the plan made, or one still open.   | `D`, the number, a space, the name. |

Each type folder's schema lists its fields and says what each one means:

- [tasks](tasks/tasks.schema.md): `number`, `title` and `status` are required. `milestone` links to
  a milestone, and `after` lists the tasks that come first.
- [milestones](milestones/milestones.schema.md): `title`, `order` and `tasks`, the tasks in the
  order the work goes. A milestone's status follows from its tasks.
- [decisions](decisions/decisions.schema.md): `title`, `status` (`decided` or `open`) and an
  optional `decided` date.

The types are open. A record may hold fields the schema does not list, so a corpus can add its own.

## Use it

Name the profile under `extends` in the corpus's root file, with a prefix. The prefix `plan` is
used below. The path starts from the corpus root:

```yaml
corpus-schema: 0
level: 2
extends:
  plan: ../profiles/planning
```

Then give each type you want a local folder whose schema names the profile's type with
`x-extends`. The records go in the local folder.

To use a type as it is, the schema holds only `x-extends`:

```yaml
x-extends: plan/decisions
```

To add fields, list them in the local schema. A record must pass both schemas. To keep the type
closed, also list the profile's fields as `true` and set `additionalProperties: false`:

```yaml
x-extends: plan/milestones
type: object
additionalProperties: false
properties:
  title: true
  order: true
  tasks: true
  focus: { type: boolean }
```

A local type can add rules and tighten them. It cannot loosen the profile's rules. The links in
`milestone`, `after` and `tasks` accept records of the local types that extend the profile's
types.

The corpus needs no `_references/` copy. A profile sits under `extends`, which gives types only,
and `sync` copies only the corpora under `references`.

## Where it is used

This repo's plan, [docs/planning/](../../docs/planning/README.md), extends it. Its tasks and
milestones add fields. Its decisions use the type as it is.
