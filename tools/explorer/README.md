# Markdown ecosystem explorer

An interactive graph of the markdown ecosystem. It has two views, switched at the top and kept in
the URL:

- **Components** shows every package, crate, spec and tool, what each one uses, and how that
  changes between today (`present`) and the plan's end state (`target`).
- **Work** maps the plan's milestones and tasks: all the work between the present state and the
  target, and what waits on what.

## Run it

```sh
sh ../build-corpus-schema.sh
pnpm install --ignore-workspace
pnpm dev
```

Open the address Vite prints. The explorer is its own package, with its own lockfile, so it is not
part of the repo's pnpm workspace. `--ignore-workspace` keeps pnpm from installing the workspace
instead.

The first line builds this repo's corpus-schema in `packages/ts/corpus-schema/`. The explorer's
`@osdlc/corpus-schema` is a `link:` to that folder, because the plan uses `extends` and the 0.2.0
on npm does not know it. Run the line again after corpus-schema changes.

### Components

- **Present**, **Target** and **Compare** switch the view. Compare shows both states and marks what
  goes away and what is new. Nodes never move when you switch.
- Click a node or an edge to see its details. Click empty canvas, or press Esc, to clear it.
- Tab moves through the nodes and Enter selects one.
- The URL holds the selected node (`#node=<id>`), so you can link to it.
- A card's plan tasks are links: each opens that task in the Work view.
- The filters narrow the graph by language, kind and repo. Search highlights matching nodes.
- Card fill and border show what the component is, in every view: green for a twin pair, blue for a
  component kept without a twin, red (dashed, "going away") for one that exists only today, and
  yellow ("new") for one that exists only in the target. Red and yellow win over green and blue when
  the whole card is in one state. New edges are yellow, going-away edges are red and dashed, edges in
  both states are grey. The left stripe is the repo, in greys.
- Each card shows its language as a logo in the top-right corner: TypeScript, Rust, Markdown or YAML.
- A twin pair, the same library in TypeScript and Rust, is one card with both logos. The data keeps
  two nodes; only the view merges them. Edges to either member attach to the card. When the two
  differ, a small badge on one logo says so: `+` new, `−` going away, `⇢` moves repo on its own.
  The detail panel shows each member's facts, and each linked node says which member it is from.
  A link to either member's id (`#node=<id>`) opens the card.
- The Relations toggles show or hide groups of edges: dependencies (depends, dev-depends), structure
  (implements, extends, validates, reads) and overlaps. They hide edges only, never cards.
- An overlap is duplication: two components that do some of the same job. It is drawn as a dotted
  violet line with no arrow and a "≈" tag, and each card it touches shows a small "≈". The "≈ N
  overlaps" button in the header shows only the overlaps; click it again to show everything.

### Work

- **Milestones** shows one card per milestone with its goal, status and progress ("3 of 7 done").
  The card's top edge is in its phase's colour, with the phase's name on it: Store (teal), Model
  (violet) or Harness (rose). The lane headers in Tasks show the same band.
  An arrow runs from a milestone to one that waits on it, because one of its tasks waits on one of
  the other's. A milestone sits right of everything it waits on.
- **Tasks** shows each milestone as a band, in plan order. The view opens on the beeline
  milestones, the ones the work is heading for now, marked `beeline: true` in their records. A task sits one column right of the furthest task it
  waits on, so arrows run left to right in the order the work can happen. The milestone's card
  sits just left of its first task. An arrow that skips over cards in its own row arcs over them.
  The fit button in the corner shows the whole map.
- A task card shows its number, title, detail line and status. Not started is grey with an empty
  circle, in progress has a thick blue outline and a half circle, done is faded with a filled
  check, and waiting on the owner has an orange "you" marker. Supporting work has a dashed outline
  and a "support" label. Colour is never the only signal.
- A solid dark arrow still holds work up. A faded dashed arrow comes from a task that is done.
- **Next up** highlights the tasks that are not done and wait only on done tasks. The filters
  narrow by status, type, phase and milestone; Functional and Supporting are both on at first. A
  task's phase is its milestone's.
- Click a task to see its plan paragraph, what it waits on, what it unblocks, and the components it
  changes. A component link opens that card in the Components view. Click a milestone, in either
  level, to see its phase, goal, progress, tasks by status, and the milestones it waits on and that
  wait on it. A task's details show its milestone's phase too.
- Tab, Enter and Esc work as in the Components view.
- The URL holds the view, the level and the selection: `#view=work&task=27`,
  `#view=work&milestone=m-npm`, `#view=work&level=overview`.

## Edit the data

The data is generated. The plan's records in [docs/planning/](../../docs/planning/README.md) are the
source: one Markdown file per task, milestone, component, layer, repo and overlap. Edit a record,
then rebuild the JSON and commit both:

```sh
pnpm build-data
```

[scripts/build-data.mjs](scripts/build-data.mjs) validates the records with `@osdlc/corpus-schema`,
the linked copy from this repo. It checks the rules the validator can't, and writes
`data/ecosystem.json` and `data/plan.json`. Their shapes and rules are in
[data/SCHEMA.md](data/SCHEMA.md) and [data/PLAN-SCHEMA.md](data/PLAN-SCHEMA.md). CI fails when the
committed JSON differs from what the records build.

When `ecosystem.json` is missing, the app uses `data/fixture.json`, a small hand-written sample. The
header says which file it loaded. If the data breaks a rule in SCHEMA.md or PLAN-SCHEMA.md, the
header shows the problems. `pnpm test` checks both files against those rules, checks that they lay
out, and checks that they match the records.

## Build a static copy

```sh
pnpm build
```

The site goes to `dist/`, which git ignores. The data is built in, so `dist/` works on any static
host. `pnpm preview` serves it locally.

## Checks

```sh
pnpm typecheck
pnpm test
```

CI runs these, `pnpm build` and `pnpm build-data`, in `.github/workflows/planning.yml`. It builds
corpus-schema with `tools/build-corpus-schema.sh` first.

The graph and plan logic is plain TypeScript under `src/model/`, with tests under `tests/`: the
work view's dependency lists, milestone dependencies, next up, progress and layout are in
`work.ts` and `workLayout.ts`, and the cross-links between the views in `crossLinks.ts`. The Vue
components under `src/components/` only draw what it returns.

## Credits

The language logos are from [Simple Icons](https://simpleicons.org) 15.0.0, released under CC0 1.0.
Simple Icons lists the Rust logo under CC BY-SA 4.0.
