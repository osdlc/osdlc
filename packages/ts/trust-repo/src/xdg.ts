/**
 * Resolves the trust store's state directory relative to the home directory.
 *
 * ## Why the tilde is expanded
 *
 * A shell expands `~` before it runs a program, so a path from the
 * environment is usually expanded already. But direnv, `.env` loaders and CI
 * YAML pass a literal `~` through. `XDG_STATE_HOME=~/.local/state` in a
 * `.env` file would then become `<cwd>/~/.local/state`, a real directory in
 * the wrong place, created with no error. Expanding `~` here prevents that.
 *
 * `home` is a parameter and is never read from `node:os` here. Every caller
 * passes it, so a test cannot read or write the developer's real home
 * directory.
 *
 * Only `XDG_STATE_HOME`, the one variable {@link trustStoreDir} needs, is
 * handled.
 */

import { isAbsolute, join } from 'node:path'

import { expandTilde } from './paths.ts'

/**
 * An XDG base directory from the environment, with a fallback under `home`.
 *
 * `env[varName]` is used when it is set, not blank, and absolute after `~`
 * is expanded. A relative value is ignored, as the XDG spec says. Resolving
 * it would put the store under whatever directory the tool runs in, which can
 * be the repository being judged. Otherwise the fallback segments are joined
 * to `home`:
 * `xdgHome(env, home, "XDG_STATE_HOME", ".local", "state")` is
 * `~/.local/state`.
 *
 * XDG paths are used on every platform, macOS included. Nothing in this
 * package branches on `process.platform` for storage. This matches the
 * config home lookup in `@osdlc/config-layers`.
 * @experimental
 */
export function xdgHome(
  env: Record<string, string | undefined>,
  home: string,
  varName: string,
  ...fallbackSegments: string[]
): string {
  const raw = env[varName]?.trim()
  if (raw !== undefined && raw !== '') {
    const expanded = expandTilde(raw, home)
    if (isAbsolute(expanded)) return expanded
  }
  return join(home, ...fallbackSegments)
}
