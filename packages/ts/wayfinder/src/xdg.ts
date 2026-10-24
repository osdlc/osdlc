/**
 * Home-relative paths. `home` is always injected, so a test never reads or
 * writes the real home directory.
 */

import { join } from 'node:path'

/**
 * Expand a leading `~` against `home`; anything else is returned unchanged.
 * direnv, `.env` loaders and CI YAML pass a literal tilde through, and
 * `<cwd>/~/x` would be a silent wrong answer.
 */
export function expandTilde(path: string, home: string): string {
  if (path === '~') return home
  if (path.startsWith('~/')) return join(home, path.slice(2))
  return path
}
