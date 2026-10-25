import { join } from 'node:path'

import { homeDir, xdgHome } from '@osdlc/trust-repo'

import { APP, LEGACY_APP } from './app.ts'

/**
 * Where stored runner probes live: `$XDG_CACHE_HOME/wayfinder`, else
 * `~/.cache/wayfinder`. `@osdlc/system-model` owns the layout inside it.
 */
export function cacheDir(
  env: Record<string, string | undefined> = process.env,
  home: string = homeDir(),
): string {
  return join(xdgHome(env, home, 'XDG_CACHE_HOME', '.cache'), APP)
}

/** The old waypost cache directory. Never read; `way clean` offers to remove it. */
export function legacyCacheDir(
  env: Record<string, string | undefined> = process.env,
  home: string = homeDir(),
): string {
  return join(xdgHome(env, home, 'XDG_CACHE_HOME', '.cache'), LEGACY_APP)
}
