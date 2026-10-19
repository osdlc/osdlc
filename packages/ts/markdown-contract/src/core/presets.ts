/**
 * Shorthands for common contract shapes: the two usual level options, body grammars built from
 * them, and an optional section.
 */
import { optional, section, sections } from './grammar.js'
import type { BodyOf, LevelOpts, SectionOpts, SectionSeq, Spec } from './types.js'

/** Level options for a body in any order that allows undeclared sections. */
export const LENIENT: LevelOpts = { order: 'none', allowUnknown: true }

/** Level options for a body in strict order with no undeclared sections. */
export const STRICT: LevelOpts = { order: 'strict', allowUnknown: false }

/**
 * A body grammar in any order that allows undeclared sections: `sections(LENIENT, specs)`. Like
 * `sections()`, it types the body.
 *
 * @param specs The sections, in order.
 * @throws {Error} When two names have the same camelCase key, as `sections()` does.
 */
export function lenientBody<const S extends readonly Spec[]>(specs: S): SectionSeq<BodyOf<S>> {
  return sections(LENIENT, specs)
}

/**
 * A body grammar in strict order with no undeclared sections: `sections(STRICT, specs)`. Like
 * `sections()`, it types the body.
 *
 * @param specs The sections, in order.
 * @throws {Error} When two names have the same camelCase key, as `sections()` does.
 */
export function strictBody<const S extends readonly Spec[]>(specs: S): SectionSeq<BodyOf<S>> {
  return sections(STRICT, specs)
}

/**
 * An optional section: `optional(section(name, opts))`.
 *
 * @param name The heading text, or several accepted spellings.
 * @param opts The section's options, as for `section()`.
 * @throws {Error} When `opts` has bad repeat bounds, as `section()` does.
 */
export function optionalSection(name: string | string[], opts?: SectionOpts): Spec {
  return optional(section(name, opts))
}
