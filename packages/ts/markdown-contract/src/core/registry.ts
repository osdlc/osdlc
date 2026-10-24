/**
 * The default `FindingLevel` for each finding id, and the `Ctx` factory (`makeCtx`).
 *
 * A finding id has one default level wherever it is reported. The code that reports it does not
 * choose. This registry holds the defaults for the structure, content (including frontmatter),
 * text and rule planes.
 *
 * `makeCtx(path, registry)` returns the `Ctx` a rule uses. Its `finding(...)` sets the document
 * `path` and fills `level` from the registry when the caller gives none. The engine's own
 * structure findings go through the same `Ctx`, so every default comes from one place.
 */
import type { Ctx, Finding, FindingLevel, SourcePos } from './types.js'

/** The default level of each structure-plane finding id. */
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
 * The default level of each content and frontmatter finding id. All are `error`, because data
 * of the wrong shape cannot be read into the typed model.
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
  // frontmatter: the YAML itself, then Zod over it
  'frontmatter/yaml': 'error',
  'frontmatter/enum': 'error',
  'frontmatter/unknown-key': 'error',
  'frontmatter/type': 'error',
  'frontmatter/required': 'error',
  // a failed `.refine()` check is reported by Zod as a `custom` issue
  'frontmatter/refine': 'error',
}

/**
 * Default levels for rule ids: `rule/*` and the ids a contract's `rule` or `docRule` chooses,
 * such as `task/...` or `summary/...`. A rule names the problem and the engine fills the default
 * level. A rule that sets its own `level` overrides this. An id not listed here still defaults
 * to `"error"` in {@link makeCtx}, so this table documents the defaults but is not required.
 */
const RULE_LEVELS: Record<string, FindingLevel> = {
  // docRule ids the corpus contracts use
  'task/post-mortem-when-worked': 'error',
  'task/completion-note-when-closed': 'error',
  // section rule ids the corpus contracts use
  'summary/mentions-outcome': 'error',
  'summary/names-contract': 'warn',
}

/**
 * Default levels for text checks (`text/*`). Every text check reports one of three ids:
 * `text/requires` (a required phrase is missing), `text/forbids` (a forbidden phrase is
 * present) and `text/count` (a `min` or `max` count is not met). All default to `error`. A
 * check's `level` overrides that.
 */
const TEXT_LEVELS: Record<string, FindingLevel> = {
  'text/requires': 'error',
  'text/forbids': 'error',
  'text/count': 'error',
}

/** Maps a finding id to its default level. */
type LevelRegistry = Record<string, FindingLevel>

/** A new registry with the structure, content, text and rule defaults. */
export function defaultRegistry(): LevelRegistry {
  return { ...STRUCTURE_LEVELS, ...CONTENT_LEVELS, ...TEXT_LEVELS, ...RULE_LEVELS }
}

/**
 * Builds the `Ctx` that rules use to make findings. `finding({id, message, level?, pos?})`
 * sets the document `path` and fills `level` from the registry (`"error"` for an id not in
 * it). It sets `pos` only when given. A finding about something missing has no `pos`.
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
 * Wraps a `Ctx` so every finding it makes carries `hint`: the nearest `description` that
 * encloses the check. The engine works out that hint (the scope's own description, else the
 * inherited one) and wraps once per scope. A later wrap overrides an earlier one, so the
 * innermost description wins. When `hint` is `undefined` it returns `ctx` unchanged, so a
 * contract with no descriptions gives findings with no `hint` key.
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
