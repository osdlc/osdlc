---
id: D-02
type: decision
state: proposed
created: 2026-11-13
---

# D-02: The query shape and its string form

Proposed. It waits for the owner's sign-off.

## Decision

- A query is one plain JSON object: `type`, `corpus`, `where`, `search`, `sort`, `limit`,
  `offset`, `fields`, `body`. REST and MCP pass it to the core unchanged.
- `where` is a list of conditions that must all hold. A condition is `{ field, op, value }`, or
  a term of the string form such as `status=done`. The two can be mixed in one list.
- The string form has eight operators: `=`, `!=`, `~`, `!~`, `>`, `>=`, `<`, `<=`. A comma after
  `=` or `!=` makes a list. `field=` and `field!=` ask whether the field has a value.
- A term's value runs to the end of the term. The command line and a URL give one term per
  argument or parameter, so a value with spaces needs no inner quotes. Only a whole filter in one
  string needs them.
- A bare name is a data field. A record's own facts are written with `@`: `@id`, `@type`,
  `@title`. The `@` may be left off when no queried type has a data field of that name.
- A filter on a reference field compares the record it points at, not the link text.
- A result carries no data and no body unless the query asks: `fields` and `body`.
- A query is checked before it runs. An unknown type, corpus or field, and a value the schema
  rules out, are errors that list what exists.

## Why

- One JSON shape means the four surfaces cannot drift apart, and a query copied from one works
  on another.
- The string form is for a person at a shell and for a URL. `status=done` is what people type
  first, so it works. The operators are the ones a shell user already knows.
- `field=` for "has no value" needs no character a shell treats specially. `field?` is a glob in
  zsh, and `!field` is history expansion in bash.
- A reference field holds a Markdown link such as `[Claude Code](../../harnesses/Claude%20Code.md)`.
  Nobody types that. Comparing the target is what the caller means.
- The harness reference is 5.6 MB as JSON. A default that returned data would fill an agent's
  context with one call. Headers by default, and a clear way to ask for more, keeps answers small.
- An agent corrects itself from an error that lists the valid names. An empty result for a
  misspelt field teaches it nothing.

## Not chosen

- "Or" between conditions, and nested conditions. A list after `=` covers the common case. It
  can be added as a new kind of condition without changing this shape.
- A query language such as SQL, JSONPath or Dataview's. Each is larger than the need, and each
  has to be explained to an agent.
- Filtering on a reference inside an object or a list of objects by its target. corpus-schema
  resolves `x-ref` on a top-level field and on its items, so those are the places a target is
  known.

## Where it differs from the plan

Task 72 of the Markdown Ecosystem Plan says a query names a referenced type by its namespace
path, such as `org/principles`, that each result carries the record's identity, and that one
record reached by two paths is one result. All three hold here. The plan does not fix a query
shape, so this one is new. Task 15 also names moving markdown-vault-query here, which decision
D19 leaves in another repository. Nothing was moved.
