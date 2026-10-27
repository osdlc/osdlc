/**
 * What a `[target]` positional or `--pr` flag names, across every PR command.
 *
 * There are four forms:
 *
 * - a bare number (`1937`, `#1937`) is a PR in the repository the command runs in;
 * - `owner/repo#1937` names a PR in another repository;
 * - a PR URL names the repository too;
 * - no target means the PR for the branch checked out here.
 *
 * `parsePrInput` works for any code host except for URLs. It reads the text
 * with `@osdlc/typed-gh`'s `parsePrRef`, so `owner/repo#N` is held to the same
 * slug rule as typed-gh's (an owner starts with a letter or digit, neither
 * part holds anything but letters, digits, `_`, `.` and `-`). Only GitHub
 * URLs are parsed, through typed-gh's `parsePrUrl`. Another host's URL form
 * would be one more branch here.
 */

import { parsePrRef } from '@osdlc/typed-gh'

import type { PrInput } from './types.ts'

/**
 * The host of a URL authority for {@link PrRef.host}: lower-cased, without a
 * port, as typed-git's `RemoteRepo.host` is, so the two compare equal.
 */
export function prHost(authority: string): string {
  return authority.replace(/:\d+$/, '').toLowerCase()
}

/** Parse the positional/flag value; null when it is none of the four shapes. */
export function parsePrInput(raw: string | null | undefined): PrInput | null {
  const text = (raw ?? '').trim()
  if (text === '') return { kind: 'current' }

  const ref = parsePrRef(text)
  // A branch name is not one of the four shapes: the current branch is the empty target.
  if (ref === null || ref.kind === 'branch') return null
  if (ref.kind === 'url') {
    return {
      kind: 'url',
      ref: {
        codeHost: 'github',
        host: prHost(ref.hostname),
        owner: ref.owner,
        repo: ref.repo,
        number: ref.number,
      },
    }
  }
  if (ref.repo === null) return { kind: 'number', number: ref.number }
  return { kind: 'slug', owner: ref.repo.owner, repo: ref.repo.repo, number: ref.number }
}
