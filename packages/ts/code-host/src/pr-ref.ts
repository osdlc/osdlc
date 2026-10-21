/**
 * What a `[target]` positional or `--pr` flag names, across every PR command.
 *
 * Four spellings, one answer: a bare number (`1937`, `#1937`) is a PR in the
 * repository the command runs in; `owner/repo#1937` names a PR in another
 * repository; a PR URL names the repository too; no target at all means the
 * PR for the branch checked out here.
 *
 * `parsePrInput` is code-host-agnostic (only its URL branch is GitHub-specific today,
 * via `@osdlc/typed-gh`'s `parsePrUrl` — a second code host's URL shape is a
 * second branch here, not a rewrite).
 */

import { parsePrUrl } from '@osdlc/typed-gh'

import type { PrInput } from './types.ts'

// Captures an `owner/repo#N` PR reference — not a slug, so not to be confused
// with a plain kebab-case-slug matcher.
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
