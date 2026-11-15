# ecosystem.json

The component data behind the explorer. One file, `ecosystem.json`, beside this note. The plan
behind the Work view is `plan.json`, described in [PLAN-SCHEMA.md](PLAN-SCHEMA.md).

Both files are generated. The source is the plan's records in
[docs/planning/markdown/](../../../docs/planning/markdown/README.md): one component, layer, repo or overlap per file.
Edit a record, not this file, then run `pnpm build-data` (see
[scripts/README.md](../scripts/README.md)).

It describes every component of the markdown ecosystem in two states: how things are today
(`present`) and where the plan wants them (`target`). A component that exists in both states is one
node. A component that only exists today is being retired. A component that only exists in the
target is planned.

```jsonc
{
  "asOf": "2026-11-09",                 // the date the facts were checked
  "sources": ["docs/architecture/markdown-target.md", "..."],   // what the facts were taken from
  "layers": [                           // top to bottom, as in docs/architecture/markdown-target.md
    { "id": "files", "label": "1. Files", "summary": "one sentence" }
  ],
  "repos": [
    { "id": "osdlc/osdlc", "label": "osdlc", "url": "https://github.com/osdlc/osdlc" }
  ],
  "nodes": [
    {
      "id": "corpus-schema-ts",         // stable, kebab-case, unique; the record's file name
      "name": "@osdlc/corpus-schema",   // the package or crate name as published, or a plain name
      "kind": "package",                // package | crate | spec | profile | corpus | tool | app | workflow
      "language": "ts",                 // ts | rust | yaml | markdown | none
      "layer": "spec",                  // a layers[].id
      "states": ["present", "target"],  // which states it exists in
      "repo": { "present": "osdlc/osdlc", "target": "osdlc/osdlc" },  // null for a state it is absent from
      "path": { "present": "packages/ts/corpus-schema", "target": "packages/ts/corpus-schema" },
      "status": "published",            // published | unpublished | in-progress | planned | retiring | proposal
      "version": "0.2.1",               // latest published version, or null
      "registry": "https://www.npmjs.com/package/@osdlc/corpus-schema",  // or crates.io, or null
      "twin": "corpus-schema-rs",       // id of the same library in another language, or null
      "purpose": "One or two plain sentences: what it does and who uses it.",
      "notes": ["Short facts worth knowing: a move, a rename, an open question."],
      "tasks": [21, 32],                // ids of the plan.json tasks that change it
      "links": [{ "label": "PR #9", "url": "https://github.com/osdlc/markdown/pull/9" }],
      "source": "docs/planning/markdown/components/corpus-schema-ts.md"  // optional: repo-relative path of its record
    }
  ],
  "edges": [
    {
      "from": "corpus-schema-ts",       // the dependent
      "to": "markdown-link",            // what it depends on, implements or extends
      "kind": "depends",                // depends | dev-depends | twin | implements | extends | validates | reads | overlaps
      "states": ["present", "target"],  // present only = goes away; target only = new
      "note": "optional, one sentence",  // required on overlaps
      "overlap": "copy"                 // overlaps only: copy | partial
    }
  ]
}
```

Rules:

- Every `edges[].from` and `edges[].to` is a `nodes[].id`.
- An edge's states are a subset of both its nodes' states.
- `repo` and `path` hold `null` for a state the node is absent from.
- A twin pair gets one `twin` edge (`from` the Rust crate, `to` the TypeScript package) and each node
  names the other in `twin`.
- An `overlaps` edge marks duplication: two components that do some of the same job.
  - It has no direction. Write the older or canonical one as `to`.
  - `overlap` is required: `copy` when one is a copy or fork of the other, `partial` when they
    solve part of the same problem in different code.
  - `note` is required: one plain sentence saying what overlaps, from a source someone can check.
  - It never joins twins. A twin pair is intended duplication across languages and has its own edge.
  - One overlap edge per pair of nodes, in either order.
  - `states` work as for other edges: present only means the plan removes the overlap; present and
    target means it stays.
- `overlap` appears on `overlaps` edges only.
