/**
 * The old way the trust store found its state home: `XDG_STATE_HOME`, else
 * `~/.local/state`, on every platform. A store whose tool passes no
 * `vendorDirs` still lives there. A store with `vendorDirs` resolves through
 * `@osdlc/tiered-dirs` instead, as `@osdlc/config-layers` does, so it
 * follows the convention, the `<PREFIX>_*` overrides and Windows' own
 * places. See `./store.ts`.
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
 * Only `XDG_STATE_HOME`, the one variable the old place needs, is handled.
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
 * This is the XDG rule on every platform, macOS and Windows included. It is
 * not the rule `@osdlc/tiered-dirs` applies on macOS under its `native`
 * convention or on Windows, so it gives the old trust store's place, not a
 * tool's current state home.
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
