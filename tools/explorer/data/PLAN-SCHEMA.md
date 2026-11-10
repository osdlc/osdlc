# plan.json

The plan behind the Work view: every milestone and task between the present state and the target.
One file, `plan.json`, beside this note. `scripts/sync-plan.mjs` copies it from the plan's
`tasks.json`:

```sh
node scripts/sync-plan.mjs                # from ../../docs/diagrams/tasks.json
node scripts/sync-plan.mjs path/to/tasks.json
```

```jsonc
{
  "asOf": "2026-11-09",                  // the date the facts were checked
  "statuses": [                          // the label for each status
    { "id": "done", "label": "done" }    // done | doing | owner | todo
  ],
  "types": [
    { "id": "functional", "label": "Functional" }   // functional | supporting
  ],
  "milestones": [                        // in plan order: the current beeline first
    {
      "id": "m-npm",                     // stable, kebab-case, unique
      "title": "Upstream corpora over npm",
      "goal": "One or two plain sentences: what is true when it is done.",
      "status": "todo",                  // a statuses[].id
      "tasks": [9, 27, 29],              // its task ids, in plan order
      "source": "docs/plan/m-npm.md"     // optional: repo-relative path of its markdown record
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
      "source": "docs/plan/27.md"        // optional, as for milestones
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
