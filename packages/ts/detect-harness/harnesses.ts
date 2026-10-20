/**
 * The harness ids this package knows, and the other names callers use for them.
 *
 * The ids are short, lower-case and fixed, so a harness report can be joined to
 * a tool list by id. Other code spells some harnesses differently;
 * {@link HARNESS_ALIASES} maps those spellings here.
 *
 * Runtime-agnostic: pure data.
 */

/** The built-in harness ids, in report order. */
export const BUILTIN_HARNESSES = [
  'claude',
  'codex',
  'cursor',
  'opencode',
  'pi',
  'antigravity',
] as const

/** One of {@link BUILTIN_HARNESSES}. */
export type BuiltinHarnessId = (typeof BUILTIN_HARNESSES)[number]

/**
 * Other names for the built-in harnesses: spellings seen in other tools
 * (`claude-code`, `codex-cli`, `open-code`) and the binary names that differ
 * from the id (`cursor-agent`, `agy`).
 */
export const HARNESS_ALIASES: Readonly<Record<string, BuiltinHarnessId>> = {
  'claude-code': 'claude',
  'codex-cli': 'codex',
  'cursor-agent': 'cursor',
  'open-code': 'opencode',
  agy: 'antigravity',
}

/** The built-in id for `name`, which may be an id or an alias; `undefined` for anything else. */
export function harnessId(name: string): BuiltinHarnessId | undefined {
  if ((BUILTIN_HARNESSES as readonly string[]).includes(name)) return name as BuiltinHarnessId
  return Object.hasOwn(HARNESS_ALIASES, name) ? HARNESS_ALIASES[name] : undefined
}
