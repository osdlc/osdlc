# sdlc-compatible records

When a craft skill creates a durable record, such as a scenario, a persona or a decision, it
suggests a structure and location that sdlc can read. A project can then adopt sdlc later without
moving or rewriting files. The skill never needs sdlc installed, and the project's own layout wins
when it has one.

## Shape

- **One file per record**, named `<ID>-<slug>.md`: an uppercase prefix of one to three letters,
  a dash, four base-36 characters, then a lowercase hyphenated slug. Example:
  `D-7F2M-why-what-verify-chain.md`.
- **Frontmatter** with at least:
  - `type`: the record's kind, lowercase and singular (`decision`, `persona`).
  - `id`: the same id as the file name.
  - `title`, `created` (`YYYY-MM-DD`) and `tags` when the record has them.
  - `related`: wikilinks to other records, such as `'[[D-7F2M]]'`.
- **A body** that opens with one `# <title>` heading.

## Location

- Records of one kind share one folder named for the kind, in the plural:
  `docs/planning/<kinds>/` at the project root, or the folder the project already uses.
- Kinds sdlc already has keep their prefixes and folders: backlog (`B`), capabilities (`C`),
  decisions (`D`), drivers (`DR`), frictions (`FR`), milestones (`M`), notes (`N`), principles
  (`P`), products (`PR`), references (`RF`), roadmaps (`RM`), standards (`S`), tasks (`T`) and
  terms (`TM`). Each folder is the kind's plural name, except `backlog/`.
- sdlc also reserves `AC`, `AG`, `CO`, `CT`, `E`, `EV`, `G`, `R`, `RL` and `W` for kinds it has
  planned or retired. Never use them.
- **Known kinds** that craft skills write are fixed in the reference that owns them: scenario,
  persona, trial and round in [scenario-format.md](scenario-format.md). Use them as written.
- For any other kind sdlc does not have, pick a prefix none of the above uses and that no folder
  under `docs/planning/` already uses, and say in the folder's README that it is a proposed
  kind. When sdlc is installed, its own list is the authority.
- A project that already has its own scheme for a kind keeps it.

When sdlc is installed and has a `create` verb for the kind (`sdlc <kind> create`), use it
instead of writing the file by hand.
