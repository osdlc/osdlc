/**
 * The failure for a tool a code host needs that is not installed, worded as
 * the adapters word it: `gh` through `@osdlc/typed-gh`'s classification, `curl`
 * through the Forgejo adapter's. A caller that checks `PATH` before it lists
 * anything (a CLI's preflight) reports the same message the adapter would have
 * reported after a failed call.
 */

import { classifyFailure, CommandFailed } from '@osdlc/command-seam'
import { classifyGhFailure } from '@osdlc/typed-gh'

import { CURL_INSTALL_HINT } from './forgejo.ts'
import { fromGhFailure, type CodeHostFailure } from './failure.ts'
import type { CodeHostName } from './types.ts'

/** The `not-installed` failure for the tool `host`'s adapter shells out to: `gh` for GitHub, `curl` for Forgejo. */
export function missingToolFailure(host: CodeHostName): CodeHostFailure {
  const binary = host === 'github' ? 'gh' : 'curl'
  const argv = ['--version']
  const result = {
    exitCode: 1,
    stdout: '',
    stderr: '',
    neverExited: true,
    reason: 'spawn' as const,
    error: `spawn ${binary} ENOENT`,
  }
  if (host === 'github') {
    return fromGhFailure(classifyGhFailure(new CommandFailed(argv, result, 'gh')))
  }
  const failed = classifyFailure(result, { binary, argv })
  if (failed === null) throw new Error('unreachable: a spawn that never ran is a failure')
  return {
    kind: 'not-installed',
    message: failed.message,
    hint: CURL_INSTALL_HINT,
    host,
    cause: failed,
  }
}
