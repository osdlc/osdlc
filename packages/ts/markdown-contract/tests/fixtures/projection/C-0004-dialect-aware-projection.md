---
type: capability
schema_version: '1'
id: C-0004
kind: technical
title: Dialect-aware projection
status: open/verified
created: '2026-06-20'
parent_key: null
contains: []
related:
  - '[[C-0001-contract-validation]]'
  - '[[C-0002-typed-consumption]]'
tags:
  - projection
  - parsing
  - obsidian
need_human_review: true
---

# Dialect-aware projection

## Summary

- Parse a document once into a typed tree (`DocTree`). The base projection is useful out of the box — GFM tables / lists and `^block-id` anchors are built in — and the bundled Obsidian dialect (`[[wikilinks]]`, `![[transclusions]]`) is enabled by default; further dialects attach as extensions. ^summary
- The single parse every other capability reads from.

## Statement

The projection turns raw markdown + frontmatter into a stable, typed tree of sections and block nodes that contracts address. It extends the unified / remark parse for the constructs validation needs — most sharply the `^block-id` anchor, which binds a block to a name a contract resolves — and enforces the projection invariants (fence opacity, heading depth-jump handling, no block hoisting).

## What it provides

- One remark / mdast parse → a `DocTree` projection: sections, block kinds, and frontmatter with per-key line mapping.
- Obsidian-dialect nodes: `^block-id` anchors (bindable), wikilinks, and transclusions, alongside GFM tables and lists.
- The committed projection invariants (fenced code is opaque; depth jumps attach as direct children).

## Inputs

- Raw markdown + frontmatter. The base parse bundles `remark-gfm` ^4 (so pipe tables and task lists project to real `table` / `list` nodes rather than paragraph text) and `^block-id` anchors, plus the Obsidian wikilink / transclusion dialect on by default — nothing to configure for a useful tree. `opts.extensions` is **additive**: it layers *further* dialects on top; it does not switch the bundled ones on.

```ts
parse(markdown: string, opts?: { extensions?: MicromarkExtension[] }): DocTree  // GFM + anchors + Obsidian on by default
```

## Outputs

- One positioned, typed `DocTree` — the single substrate both planes read. Every node carries a `SourcePos`, so findings localize to `<file>:<line>` (named `SourcePos`, not `Position`, to avoid the unist/mdast clash).

```ts
interface SourcePos { line: number; col?: number }   // single point; grows `end?` when LSP/SARIF lands

interface DocTree {
  frontmatter: {
    raw: string; data: unknown; pos: SourcePos;
    lineForPath(path: (string | number)[]): number | undefined;   // Zod issue path → key line
  } | null;
  root: SectionNode;   // synthetic; root.sections are the top-level H2s
  mdast: Root;         // the raw layer-0 parse, exposed for analysis (not hidden)
}

interface SectionNode {
  name: string; depth: number; pos: SourcePos;
  sections: SectionNode[];   // nested subsections, by heading depth
  blocks: BlockNode[];       // heading-direct, non-heading content
  anchors: string[];         // section-level ^block-ids
}

interface ListItem { text: string; checked?: boolean; pos: SourcePos }

type BlockNode =
  | { kind: "table"; columns: string[]; rows: string[][]; rowPos(i: number): SourcePos; anchor?: string; pos: SourcePos }
  | { kind: "list"; ordered: boolean; items: ListItem[]; anchor?: string; pos: SourcePos }
  | { kind: "code"; lang: string | null; value: string; anchor?: string; pos: SourcePos }
  | { kind: "paragraph"; text: string; anchor?: string; pos: SourcePos };
```

- Committed projection invariants: fenced code is opaque (a `##` / `^id` / pipe line inside a fence is never re-scanned); a skipped heading level attaches to the nearest ancestor and emits `structure/heading-depth-jump` (warn); a block nested in a blockquote / list item is not hoisted to `section.blocks`; frontmatter is parsed position-aware so `lineForPath` can localize a Zod issue.

## Hook points

- `opts.extensions: MicromarkExtension[]` — the seam for *additional* dialects beyond the bundled base. The base set (GFM, `^block-id` anchors, Obsidian wikilinks / transclusions) is always on; extensions add foreign syntaxes (a different callout grammar, a custom embed) without re-enabling the defaults.

## Underlying implementation

- Planned: `src/core/projection.ts` (mdast → positioned section tree) on unified / remark at current majors + `remark-gfm` ^4 + `remark-frontmatter`. The Obsidian dialect ships as `micromark-extension-obsidian` (independent package vs in-repo module — `D·packaging`).
- Build-vs-adopt for the dialect parser, and the invariants above, are the `D·projection` ADR. Not yet built — lands in an implementation milestone.

## Notes

Underpins [[C-0001-contract-validation]] and [[C-0002-typed-consumption]]. Framing per review: `^block-id` anchors and GFM are the **base** projection — the contract model's addressing primitive and its table / list support, always on, not opt-in — while the `[[wikilink]]` / `![[transclusion]]` vault-reference constructs are a **bundled dialect, enabled by default** but conceptually swappable. Whether that dialect is built in-house or adopted (`micromark-extension-obsidian` vs a wikilink / OFM plugin + an in-house `^block-id` extension) is the open `D·projection` ADR — a packaging / sourcing question, not a question of whether it ships by default. Absorbs the former Obsidian "driver" (reclassified per review). Status `open/planned`.
