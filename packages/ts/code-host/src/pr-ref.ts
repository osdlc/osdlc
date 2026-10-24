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
 * `parsePrInput` works for any code host except for URLs. Only GitHub URLs are
 * parsed, through `@osdlc/typed-gh`'s `parsePrUrl`. Another host's URL form would
 * be one more branch here.
 */

import { parsePrUrl } from '@osdlc/typed-gh'

import type { PrInput } from './types.ts'

// Matches an `owner/repo#N` PR reference.
const OWNER_REPO_PR_RE = /^([\w.-]+)\/([\w.-]+)#(\d+)$/

/** Parse the positional/flag value; null when it is none of the four shapes. */
export function parsePrInput(raw: string | null | undefined): PrInput | null {
  const text = (raw ?? '').trim()
  if (text === '') return { kind: 'current' }

  const asNumber = /^#?(\d+)$/.exec(text)
  if (asNumber !== null) {
    const number = Number(asNumber[1])
    return number > 0 && Number.isSafeInteger(number) ? { kind: 'number', number } : null
  }

  const slug = OWNER_REPO_PR_RE.exec(text)
  if (slug !== null) {
    const number = Number(slug[3])
    if (!(number > 0 && Number.isSafeInteger(number))) return null
    return { kind: 'slug', owner: slug[1]!, repo: slug[2]!, number }
  }

  const ref = parsePrUrl(text)
  if (ref === null) return null
  return {
    kind: 'url',
    ref: { codeHost: 'github', owner: ref.owner, repo: ref.repo, number: ref.number },
  }
}
