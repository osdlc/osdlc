import { homeDir } from '@osdlc/trust-repo'

import { appDirs } from './xdg.ts'

/**
 * Where stored runner probes live: `<cache>/wayfinder` (see `xdg.ts`).
 * `@osdlc/system-model` owns the layout inside it.
 */
export function cacheDir(
  env: Record<string, string | undefined> = process.env,
  home: string = homeDir(),
): string {
  return appDirs({ env, home }).cache
}
