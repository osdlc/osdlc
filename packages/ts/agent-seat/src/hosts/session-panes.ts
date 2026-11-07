/**
 * A host's memory of which pane belongs to which session:
 * `<runtime>/hosts/<name>/sessions/<slug>.json` ({@link sessionIdSlug}), holding the session id,
 * the host's own pane identifier (WezTerm's pane id, Orca's terminal handle, herdr's pane id)
 * and the cwd it was opened in. The host writes it when it opens a pane for a session and resolves a
 * later `send`/`find`/`focus`/`capture`/`close` for that session through it,
 * so two sessions in one worktree reach two different panes.
 *
 * The identifier is only a hint: a host checks it against its own live
 * listing before acting, because panes close and a restarted app reissues ids.
 */

import { join } from 'node:path'

import { ensureDir, isRecord, readJsonOrNull, sessionIdSlug, writeJsonAtomic } from '../util.ts'

/** What a host remembers about the pane it opened for a session. */
export interface RememberedPane {
  /** The host's own pane identifier. */
  pane: string
  /** The working directory the pane was opened in, so a reissued id can be told from the original. */
  cwd: string
}

/**
 * `<dir>/sessions/<slug>.json`: one file per session, so concurrent launches never overwrite each
 * other. The name is a slug with a 128-bit hash, not the id itself, so it is unique on
 * case-insensitive file systems and valid on Windows. (It was the URI-encoded id; files under
 * that name are no longer read.)
 */
function filePath(dir: string, sessionId: string): string {
  return join(dir, 'sessions', `${sessionIdSlug(sessionId, 32)}.json`)
}

/** The pane remembered for `sessionId`, or null. A file that names another id is ignored. */
export function recallSessionPane(dir: string, sessionId: string): RememberedPane | null {
  const data = readJsonOrNull(filePath(dir, sessionId))
  if (!isRecord(data) || data['id'] !== sessionId) return null
  const { pane, cwd } = data
  return typeof pane === 'string' && typeof cwd === 'string' ? { pane, cwd } : null
}

/** The pane remembered for the request's session id, or null when it carries none or none was remembered. */
export function boundPane(dir: string, target: { sessionId?: string | undefined }): string | null {
  return target.sessionId === undefined
    ? null
    : (recallSessionPane(dir, target.sessionId)?.pane ?? null)
}

/**
 * Remembers `paneId` (opened in `cwd`) for `sessionId`. A failure is reported on stderr and
 * not thrown: the session still runs, and later requests for it resolve by `cwd`.
 */
export function rememberSessionPane(
  dir: string,
  sessionId: string,
  paneId: string,
  cwd: string,
): void {
  try {
    ensureDir(join(dir, 'sessions'))
    writeJsonAtomic(filePath(dir, sessionId), { id: sessionId, pane: paneId, cwd })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[host] could not remember the pane of session ${sessionId}: ${detail}\n`)
  }
}
