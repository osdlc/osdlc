# The showcase fixture

A tiny repository that exists to be photographed and frame-captured. Nothing
here is real: every recipe echoes.

It is committed, and small on purpose, because both capture paths need a task
list that does not move. Pointed at wayfinder's own repository they would show a
four-figure task count that changes with every commit, and every regenerated
shot would differ for reasons no reader cares about.

What it holds, and why each:

| File | Gives |
|---|---|
| `justfile` | a plain recipe, a documented one, a service, and a **parameterised** one — the only way to photograph the run bar |
| `package.json` | `node-scripts` rows, so the tree has more than one runner to group by |
| `Makefile` | `make` targets, for a third chain shape |

**Regenerating captures needs `just` and `make` on PATH.** `just`'s parameters
come from `just --dump`; without the binary the provider falls back to parsing
source, which cannot see parameters — and the run bar has nothing to show.

Deliberately absent: anything that would make a runner spawn a subprocess to be
read (`.mise.toml`, `.moon/`). Those are withheld without trust, and a capture
whose contents depend on the operator's trust store is not a fixture.
