/**
 * Home-relative path resolution for the trust store's state directory.
 *
 * ## Why the tilde is expanded at all
 *
 * A shell expands `~` before exec, so a path that arrives through the
 * environment has usually been expanded already. The case that matters is
 * the one where nothing did: direnv, `.env` loaders and CI YAML hand the
 * LITERAL tilde through. `XDG_STATE_HOME=~/.local/state` set in a `.env`
 * file then becomes `<cwd>/~/.local/state` — a real directory, created
 * without complaint, in the wrong place. Expanding here is what stops that
 * being the silent wrong answer.
 *
 * `home` is a parameter, never read from `node:os` here: every caller
 * injects it so a test cannot read or write the developer's real home
 * directory.
 *
 * It handles only the one variable {@link trustStoreDir} needs
 * (`XDG_STATE_HOME`).
 */

import { join, resolve } from 'node:path'

/** Expand a leading `~` against `home`; anything else is returned unchanged. */
export function expandTilde(path: string, home: string): string {
  if (path === '~') return home
  if (path.startsWith('~/')) return join(home, path.slice(2))
  return path
}

/**
 * An XDG base directory out of the environment, with a home-relative
 * fallback.
 *
 * `env[varName]` wins when it is set and non-blank; it is tilde-expanded and
 * `resolve()`d, so a relative value becomes absolute rather than being
 * joined onto something later and landing somewhere nobody predicted.
 * Otherwise the fallback segments are joined onto `home` —
 * `xdgHome(env, home, "XDG_STATE_HOME", ".local", "state")` is
 * `~/.local/state`.
 *
 * XDG on every platform, macOS included — one story on every platform, no
 * storage-related branch on `process.platform` anywhere in this package,
 * matching the config home resolution in `@osdlc/config-layers`.
 * @experimental
 */
export function xdgHome(
  env: Record<string, string | undefined>,
  home: string,
  varName: string,
  ...fallbackSegments: string[]
): string {
  const raw = env[varName]?.trim()
  if (raw !== undefined && raw !== '') return resolve(expandTilde(raw, home))
  return join(home, ...fallbackSegments)
}
