/**
 * The finding-id → default `FindingLevel` registry plus the `Ctx` factory (`makeCtx`).
 *
 * `level` is **contract data**, not a call-site choice: a finding id has one
 * default severity wherever it fires. This registry holds the structure- and content-plane
 * defaults; the rule (`rule/*` / `docRule`) defaults are added when that plane lands.
 *
 * `makeCtx(path, registry)` returns the `Ctx` a rule body uses: its `finding(...)` stamps
 * the document `path` and fills `level` from the registry when the caller does not supply
 * one. Engine-internal structure findings reuse the same registry through this Ctx so
 * a single source defines every default.
 */
import type { Ctx, Finding, FindingLevel, SourcePos } from './types.js'

/** The default severity for every structure-plane finding id this plane emits. */
export const STRUCTURE_LEVELS: Record<string, FindingLevel> = {
  'structure/section-missing': 'error',
  'structure/section-order': 'error',
  'structure/duplicate-section': 'error',
  'structure/key-collision': 'error',
  'structure/anchor-missing': 'error',
  'structure/block-missing': 'error',
  'structure/block-kind': 'error',
  'structure/gap-count': 'error',
  'structure/repeat-count': 'error',
  'structure/heading-depth-jump': 'warn',
}

/**
 * The default severity for every content- and frontmatter-plane finding id.
 * Content checks default to `error` (a data-shape violation blocks the typed model); the
 * frontmatter Zod findings are likewise `error`.
 */
const CONTENT_LEVELS: Record<string, FindingLevel> = {
  // table
  'content/table/column-missing': 'error',
  'content/table/column-extra': 'error',
  'content/table/min-rows': 'error',
  'content/table/cell': 'error',
  // list
  'content/list/item-kind': 'error',
  'content/list/min-items': 'error',
  // code
  'content/code/lang': 'error',
  // paragraph
  'content/max-words': 'error',
  // frontmatter (Zod over the YAML)
  'frontmatter/enum': 'error',
  'frontmatter/unknown-key': 'error',
  'frontmatter/type': 'error',
  'frontmatter/required': 'error',
  // a `.refine()` cross-field predicate surfaces as a Zod `custom` issue
  'frontmatter/refine': 'error',
}

/**
 * Default severities for the rule plane (`rule/*` and the contract-chosen namespaces a
 * `rule` / `docRule` may mint, e.g. `task/...`, `summary/...`). `level` is contract data:
 * a rule body names the problem and the engine fills the default level. A rule
 * that supplies its own `level` overrides this; an unregistered rule id still defaults to
 * `"error"` via {@link makeCtx}, so this table is the documented, not the load-bearing, source.
 */
const RULE_LEVELS: Record<string, FindingLevel> = {
  // cross-plane docRule ids the corpus contracts use
  'task/post-mortem-when-worked': 'error',
  'task/completion-note-when-closed': 'error',
  // node-local rule ids the corpus contracts use
  'summary/mentions-outcome': 'error',
  'summary/names-contract': 'warn',
}

/**
 * Default severities for the text plane (`text/*`). Every declarative text constraint
 * emits through these three ids: `text/requires` (a required phrase is missing), `text/forbids`
 * (a forbidden phrase is present), and `text/count` (a `min` / `max` occurrence bound is
 * violated). All default to `error`, overridable per entry via the spec's `level`.
 */
const TEXT_LEVELS: Record<string, FindingLevel> = {
  'text/requires': 'error',
  'text/forbids': 'error',
  'text/count': 'error',
}

/** The id → default-level registry. extends it with rule ids. */
type LevelRegistry = Record<string, FindingLevel>

/** A fresh registry seeded with the structure-, content-, text-, and rule-plane defaults. */
export function defaultRegistry(): LevelRegistry {
  return { ...STRUCTURE_LEVELS, ...CONTENT_LEVELS, ...TEXT_LEVELS, ...RULE_LEVELS }
}

/**
 * Build the rule-author finding factory. `finding({id, message, level?, pos?})` stamps
 * the document `path`, fills `level` from the registry (defaulting to `"error"` for an
 * unregistered id), and carries `pos` only when supplied (omitted for absence findings).
 */
export function makeCtx(path: string, registry: LevelRegistry): Ctx {
  return {
    path,
    finding(f: { id: string; message: string; level?: FindingLevel; pos?: SourcePos }): Finding {
      const level: FindingLevel = f.level ?? registry[f.id] ?? 'error'
      const out: Finding = { id: f.id, level, path, message: f.message }
      if (f.pos !== undefined) out.pos = f.pos
      return out
    },
  }
}

/**
 * Decorate a `Ctx` so every finding it mints carries `hint` — the nearest enclosing authored
 * `description` in scope at the mint site. The engine walks compute the EFFECTIVE hint
 * (own description ?? inherited) and wrap once per scope; a later wrap overrides an earlier one,
 * so the innermost description wins. `hint === undefined` returns `ctx` unchanged — a
 * description-free contract mints byte-identical findings (no `hint` key at all).
 */
export function withHint(ctx: Ctx, hint: string | undefined): Ctx {
  if (hint === undefined) return ctx
  return {
    path: ctx.path,
    finding(f: { id: string; message: string; level?: FindingLevel; pos?: SourcePos }): Finding {
      const out = ctx.finding(f)
      out.hint = hint
      return out
    },
  }
}
