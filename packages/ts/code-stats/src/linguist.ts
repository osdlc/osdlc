import type { LinguistAttributes } from './types.ts'

/** The git attributes GitHub linguist reads, and the {@link LinguistAttributes} key each sets. */
export const LINGUIST_ATTRIBUTES = {
  'linguist-generated': 'generated',
  'linguist-vendored': 'vendored',
  'linguist-documentation': 'documentation',
} as const satisfies Record<string, keyof LinguistAttributes>

export type LinguistAttribute = keyof typeof LINGUIST_ATTRIBUTES

export function isLinguistAttribute(name: string): name is LinguistAttribute {
  return Object.hasOwn(LINGUIST_ATTRIBUTES, name)
}

/**
 * An attribute's state, as `git check-attr` prints it, read as a linguist
 * flag: `set` or any value but `false` turns it on, `unset` and `false` turn
 * it off, and `unspecified` leaves it undefined.
 */
export function linguistValue(state: string): boolean | undefined {
  if (state === 'unspecified') return undefined
  return state !== 'unset' && state !== 'false'
}
