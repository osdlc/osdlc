# Markdown ecosystem explorer

An interactive graph of the markdown ecosystem. It shows every package, crate, spec and tool, what
each one uses, and how that changes between today (`present`) and the plan's end state (`target`).

## Run it

```sh
pnpm install
pnpm dev
```

Open the address Vite prints.

- **Present**, **Target** and **Compare** switch the view. Compare shows both states and marks what
  goes away and what is new. Nodes never move when you switch.
- Click a node or an edge to see its details. Click empty canvas, or press Esc, to clear it.
- Tab moves through the nodes and Enter selects one.
- The URL holds the selected node (`#node=<id>`), so you can link to it.
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

## Edit the data

The data is `data/ecosystem.json`. Its shape and rules are in [data/SCHEMA.md](data/SCHEMA.md).

When `ecosystem.json` is missing, the app uses `data/fixture.json`, a small hand-written sample. The
header says which file it loaded. If the data breaks a rule in SCHEMA.md, the header shows the
problems.

`pnpm test` also checks `ecosystem.json` against those rules, and checks that it lays out.

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

The graph logic is plain TypeScript under `src/model/`, with tests under `tests/`. The Vue
components under `src/components/` only draw what it returns.

## Credits

The language logos are from [Simple Icons](https://simpleicons.org) 15.0.0, released under CC0 1.0.
Simple Icons lists the Rust logo under CC BY-SA 4.0.
