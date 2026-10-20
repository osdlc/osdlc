---
id: D-05
type: decision
state: accepted
created: 2026-10-19
---

# D-05: The report model and the experimental entries

## Decision

- **One report shape for every harness.** A `HarnessReport` has the same
  fields for each harness: `install`, `configDirs`, `sources`, `plugins`,
  `marketplaces`, `skills`, `commands`, `agents`, `hooks`, `mcpServers`,
  `permissions`, `instructions`, `auth` and `diagnostics`. Every field is
  always present. What a harness lacks, or what this release does not read
  yet, is empty. A field is never missing.
- **Provenance on every item.** A skill, command, agent, hook or server has an
  `origin` (`user`, `project`, `local`, `managed` or `plugin:<id>`) and the
  file it came from.
- **Schemas are public.** The report is described by Zod schemas
  (`HarnessCatalogSchema`, `HarnessReportSchema` and one per shape), so a
  caller can validate a stored report. This is why `zod` is a peer
  dependency, `^4`, and not a bundled one: the schemas the caller gets must
  come from the same copy of Zod the caller uses.
- **Failures are data.** An unreadable or malformed file becomes an entry in
  `sources` with status `error` and a message in `diagnostics`. `detect()`
  does not throw for a bad config file.
- **Entries.** The package has three:
  - `@osdlc/detect-harness`: stable. `detect`, `current`, `which`, the
    provider types and the report schemas.
  - `@osdlc/detect-harness/locations`: experimental. The table of where each
    harness keeps its files, `LOCATIONS`, and the resolvers over it. The table
    grows as harnesses change.
  - `@osdlc/detect-harness/model`: experimental. `readPlugin` reads one
    Claude Code plugin folder into a typed `HarnessModel`. A harness-neutral
    surface is planned, and this shape will change.
- The location table and its resolvers are also exported from the root entry,
  and carry the same experimental status there. The plugin reader is on
  `./model` only.

## Why

- A fixed shape means a caller writes one reader for all harnesses.
- The location table and the plugin model are the parts most likely to change
  as harnesses change. Marking them experimental lets them change in a minor
  release while the report, which callers store and compare, stays steadier.

## Consequences

- A change to the stable report shape is breaking.
- A change to `./locations` or `./model` is not breaking, but it is written
  in the changelog.
- An export marked `@experimental` in the source is listed in the README, and
  a test lists every export of every entry point.
