/**
 * The branch and short HEAD of a checkout, read from `.git` directly.
 *
 * It does not spawn git. A history event is written on every `link` and
 * `use`, and HEAD is recorded only to tell two links of one path apart later,
 * so a best-effort read is enough. Anything unreadable (no `.git`, a packed
 * ref this does not find, a detached HEAD whose object is elsewhere) gives
 * null for that field rather than an error. It handles a worktree's `.git`
 * file (`gitdir: <path>`) and the `commondir` file that points to the refs.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

/**
 * The branch and commit a checkout is on; each is null when it cannot be read.
 * @experimental
 */
export interface GitHead {
  branch: string | null
  head: string | null
}

/**
 * Read the branch and commit of a checkout from its git files, without running
 * git.
 * @experimental
 */
export function gitHead(checkout: string): GitHead {
  try {
    const gitDir = resolveGitDir(checkout)
    if (gitDir === null) return { branch: null, head: null }
    const headText = readFileSync(join(gitDir, 'HEAD'), 'utf-8').trim()
    const refMatch = /^ref:\s*(\S+)$/.exec(headText)
    if (refMatch === null) {
      return { branch: null, head: shortSha(headText) }
    }
    const ref = refMatch[1] as string
    const branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref
    return { branch, head: shortSha(readRef(gitDir, ref)) }
  } catch {
    return { branch: null, head: null }
  }
}

function resolveGitDir(checkout: string): string | null {
  const dotGit = join(checkout, '.git')
  if (!existsSync(dotGit)) return null
  if (statSync(dotGit).isDirectory()) return dotGit
  const text = readFileSync(dotGit, 'utf-8').trim()
  const m = /^gitdir:\s*(.+)$/.exec(text)
  if (m === null) return null
  const target = (m[1] as string).trim()
  return isAbsolute(target) ? target : resolve(checkout, target)
}

/** A worktree's refs live in its common dir; a plain repo's in itself. */
function commonDir(gitDir: string): string {
  const marker = join(gitDir, 'commondir')
  if (!existsSync(marker)) return gitDir
  const target = readFileSync(marker, 'utf-8').trim()
  return isAbsolute(target) ? target : resolve(gitDir, target)
}

function readRef(gitDir: string, ref: string): string | null {
  const common = commonDir(gitDir)
  const loose = join(common, ref)
  if (existsSync(loose)) return readFileSync(loose, 'utf-8').trim()
  const packed = join(common, 'packed-refs')
  if (!existsSync(packed)) return null
  for (const line of readFileSync(packed, 'utf-8').split('\n')) {
    if (line.startsWith('#') || line.startsWith('^')) continue
    const [sha, name] = line.trim().split(/\s+/)
    if (name === ref && sha) return sha
  }
  return null
}

function shortSha(value: string | null): string | null {
  if (value === null) return null
  return /^[0-9a-f]{40}$/.test(value) ? value.slice(0, 12) : null
}
