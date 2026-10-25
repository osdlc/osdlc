/**
 * The error document: what a command prints on stdout when it fails under
 * `--json` or `--output jsonl`, and what an adapter answers for a failed call.
 */

import { z } from 'zod'

/**
 * The Zod schema of {@link ErrorDocument}.
 * @experimental
 */
export const ErrorDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('error'),
  code: z.string(),
  message: z.string(),
  exit: z.number().int(),
  hint: z.string().optional(),
})

/**
 * A failed run as JSON. `code` is a stable name a script can branch on:
 * `usage` for a command line that cannot run as typed, a failure's kind (such
 * as `not-installed`) for a classified failure, the `code` a `CommandError`
 * was given, or else `error`.
 * @experimental
 */
export type ErrorDocument = z.infer<typeof ErrorDocumentSchema>

/**
 * An {@link ErrorDocument}. An empty or blank hint is left out.
 * @experimental
 */
export function errorDocument(
  code: string,
  message: string,
  exit: number,
  hint?: string,
): ErrorDocument {
  const trimmed = hint?.trim()
  return {
    schemaVersion: 1,
    kind: 'error',
    code,
    message,
    exit,
    ...(trimmed !== undefined && trimmed !== '' ? { hint: trimmed } : {}),
  }
}
