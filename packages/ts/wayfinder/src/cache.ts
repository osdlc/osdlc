import { homedir } from 'node:os'
import { join } from 'node:path'

import { xdgHome } from '@osdlc/trust-repo'

import { APP } from './app.ts'

/**
 * Where stored runner probes live: `$XDG_CACHE_HOME/wayfinder`, else
 * `~/.cache/wayfinder`. `@osdlc/system-model` owns the layout inside it.
 */
export function cacheDir(
  env: Record<string, string | undefined> = process.env,
  home: string = homedir(),
): string {
  return join(xdgHome(env, home, 'XDG_CACHE_HOME', '.cache'), APP)
}
