import type { CommandRunner } from '@osdlc/command-seam'
import type { HarnessCatalog } from '@osdlc/detect-harness'
import type { ProcessProbe } from '@osdlc/repo-cleaner'

import type { HostAdapter, HostConfig } from './adapter.ts'

/** What every entry point takes beyond repo-cleaner's own options. */
export interface HostOptions {
  /** The adapters that exist, in run order. Default none: the run is repo-cleaner's. */
  adapters?: readonly HostAdapter[] | undefined
  /** Run only these adapters, by name. */
  adapter?: readonly string[] | undefined
  /** Never run these adapters. */
  noAdapter?: readonly string[] | undefined
  config?: HostConfig | undefined
  harnesses?: HarnessCatalog | null | undefined
  /** Injectable runners, a probe and a clock, as repo-cleaner's. */
  git?: CommandRunner | undefined
  command?: ((binary: string) => CommandRunner) | undefined
  probe?: ProcessProbe | undefined
  now?: (() => Date) | undefined
}
