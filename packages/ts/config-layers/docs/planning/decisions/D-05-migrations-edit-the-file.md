---
id: D-05
type: decision
state: accepted
created: 2026-11-05
---

# D-05: Migrations are data, and their rewrite edits the file

## Decision

Both config files are versioned the same way, and a migration's rewrite edits
the file instead of rendering it again.

- **One driver.** `migrateConfigRaw` runs the steps for the machine file and,
  when `assembleConfig` gets `migrations`, for the project file and its
  overlay. A file's version is its top-level integer `version`; without one it
  is version 1. The project file and its overlay each carry their own version.
- **Declarative moves.** `defineMigrations` builds the steps. A step's `moves`
  run first, then its optional `run`. A move whose destination is already set
  keeps the destination and drops the source, with a warning. A move whose
  destination cannot be made, because a segment of it is a scalar or a list,
  leaves the source where it is, with a warning. `pruneEmpty` (on by default)
  removes the mappings on the source path that the move emptied, and only
  those.
- **The rewrite is a set of edits.** `reconcileYaml` compares the file's
  mapping with the migrated one and makes one `setPath` or `unsetPath` per
  value that differs, so every byte outside those values is kept. The result
  is read back and compared with the target. When the edits cannot produce it,
  the machine and project `migrate` render the document again and say so in
  `rewrite: 'reserialized'`.
- **Every migration write is a compare-and-swap** against the text the
  migration read, through `@osdlc/etag-write`'s `writeCas`. `write(text,
  { etag })` on the machine file offers the same to a tool's `config set`.
  `write(text)` without an etag still replaces the file whatever is on disk.
  With an etag, the machine file's `.bak` is written after the swap, from the
  bytes whose etag matched, never before it.
- **A project file's `version` is checked.** It must be an integer of at
  least 1. The machine file is not checked, as before: a non-integer reads as
  version 1 and runs every step, an integer below 1 runs none.

## Why

- A migration written over plain data and saved with `yaml.stringify` drops
  every comment in the file. The machine file did exactly that. Editing the
  document closes that trap for every tool, including a tool's hand-written
  `run` step, because the diff does not care how the target was made.
- A diff of plain data, not a replay of the moves, is what makes the
  rewrite work for `run` steps too. The cost: a moved key is written at the
  end of its new parent, and a comment line above it stays where the key
  was. Both are visible in the result's `text`, so a dry run shows them.
- Destination wins because the destination is the newer shape: a file that
  already sets it was edited by a tool that knows the new name, so that value
  is the user's later choice. A blocked destination is different. Nothing
  there is the setting, so dropping the source would lose the only copy of
  it. The source stays, and the schema reports or drops it.
- Pruning only what the move emptied keeps a mapping the user left empty on
  purpose.
- A `config set` or `migrate` that overwrites an edit saved in an editor
  between its read and its write loses that edit silently. The etag check
  turns that into an error the user can act on: run the command again.
- A `.bak` copied before the swap is overwritten by a conflict that lands
  after the copy, so a refused write would still lose the older backup. Taking
  it after the swap means a conflict, however late, leaves it alone. The cost:
  a crash between the swap and the backup leaves the older `.bak` in place.
- A rewrite that cannot be done as edits is rare (a nested change under a
  `<<: *anchor` defined elsewhere). Refusing to migrate would leave the tool
  unable to upgrade the file, so it renders the document again, keeps the
  `.bak` on the machine file, and reports it.
- A strict project `version` matches the project loader, which refuses an
  invalid file instead of salvaging it (the machine file never throws, D-01).

## Consequences

- `MachineMigration`, `migrateMachineRaw` and `currentMachineVersion` are now
  names for `ConfigMigration`, `migrateConfigRaw` and `currentConfigVersion`,
  and are deprecated. `migrateMachineRaw` also returns `warnings`, and
  `MachineMigrateResult` gains `warnings`, `rewrite` and `text`.
- A tool that validates a versioned project file's raw mapping itself, as
  `pr-update`'s `config set` does, must leave `version` out first. No tool does
  this yet; `pr-update` has no migrations.
- A file without `version` reads as version 1, so a new file in the current
  shape would go through every step. Every file a tool creates must carry
  the current version: `ConfigHandle.currentVersion`, passed as `version` to
  `scaffoldYaml`, `scaffoldLocalYaml` or `starterYaml`. The same holds for a
  file a tool's `config set` creates from a header.
- The project file's `migrate` keeps no `.bak`. The project file is in
  version control, and the overlay is small and per checkout.
- The Rust crate has no versioning or migrations. That is listed in the
  README's twin table; nothing here is in the conformance suite.
