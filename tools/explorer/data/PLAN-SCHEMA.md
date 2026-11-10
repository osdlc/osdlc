# plan.json

The plan behind the Work view: every milestone and task between the present state and the target.
One file, `plan.json`, beside this note. It is generated: the source is the plan's task and
milestone records in [docs/planning/](../../../docs/planning/README.md). Edit a record, not this
file, then run `pnpm build-data` (see [scripts/README.md](../scripts/README.md)).

```jsonc
{
  "asOf": "2026-11-09",                  // the date the facts were checked
  "statuses": [                          // the label for each status
    { "id": "done", "label": "done" }    // done | doing | owner | todo
  ],
  "types": [
    { "id": "functional", "label": "Functional" }   // functional | supporting
  ],
  "milestones": [                        // in plan order
    {
      "id": "m-npm",                     // stable, kebab-case, unique
      "title": "Upstream corpora over npm",
      "goal": "One or two plain sentences: what is true when it is done.",
      "status": "todo",                  // a statuses[].id, derived from its tasks
      "beeline": true,                   // true for the milestones the work is heading for now
      "tasks": [9, 27, 29],              // its task ids, in plan order
      "source": "docs/planning/milestones/m-npm.md"   // optional: repo-relative path of its record
    }
  ],
  "tasks": [
    {
      "id": 27,                          // a whole number, unique
      "title": "Org corpora",            // a few words
      "detail": "inherit records",       // one short line under the title
      "status": "todo",                  // done | doing (in progress) | owner (waiting on owner) | todo
      "milestone": "m-npm",              // a milestones[].id
      "type": "functional",              // functional | supporting
      "after": [9],                      // ids of the tasks it waits on
      "text": "The plan paragraph, with [markdown links](https://example.com) and `code`.",
      "source": "docs/planning/tasks/27 Org corpora.md"   // optional, as for milestones
    }
  ]
}
```

Rules:

- Every id in a task's `after` is a `tasks[].id`, and not the task's own.
- Every id in a milestone's `tasks` is a `tasks[].id`.
- A task is listed in exactly one milestone, and that is the milestone its `milestone` names.
- The `after` links have no cycle.
- `status` and `type` take only the values above.

The app checks these rules when it loads the file and shows any break in the header. It drops a
bad reference and draws the rest. `pnpm test` checks `plan.json` against the same rules, and checks
that every task number in `ecosystem.json` is a plan task.

Derived, not stored:

- A milestone waits on another when one of its tasks waits on one of the other's.
- A task is next up when it is not done and every task it waits on is done.
- A milestone's progress is its done tasks out of all its tasks.
- The components a task changes are the `ecosystem.json` nodes whose `tasks` hold its id.
