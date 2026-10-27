/**
 * wayfinder's trust store: `@osdlc/trust-repo`'s marker store in
 * `<state>/wayfinder/trusted/` (see `xdg.ts`).
 */

import { homeDir, trustStore, type TrustStore } from '@osdlc/trust-repo'

import { APP } from './app.ts'
import { appDirs } from './xdg.ts'

export interface AppTrustStoreOptions {
  /** Defaults to `process.env`. Supplies `XDG_STATE_HOME` and `WAYFINDER_ROOT`. */
  env?: Record<string, string | undefined>
  /** Defaults to `homeDir()` from `@osdlc/trust-repo`. */
  home?: string
}

/** The app's trust store. */
export function appTrustStore(opts: AppTrustStoreOptions = {}): TrustStore {
  const env = opts.env ?? process.env
  const home = opts.home ?? homeDir()
  return trustStore({ tool: APP, env, home, dir: appDirs({ env, home }).trustStore })
}
