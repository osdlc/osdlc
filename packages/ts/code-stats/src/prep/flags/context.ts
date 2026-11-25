import type { TypeScript } from '../../analysis/typescript.ts'
import type { FileGroup } from '../../groups.ts'

import type { Checkout } from '../checkout.ts'
import type { PrepFlag, Thresholds } from '../schema.ts'

/** What every flag check reads. */
export interface FlagContext {
  ts: TypeScript
  thresholds: Thresholds
  checkout: Checkout
  /** The changed files to check, as `raise` in ./index.ts selects them; deleted ones are left out. */
  files: readonly ChangedFile[]
  /** A changed file's text at the head revision; null when it cannot be read. */
  readHead(path: string): string | null
  /** A changed file's text at the base revision (its old path if renamed); null for an added file or when it cannot be read. */
  readBase(path: string): string | null
}

export interface ChangedFile {
  path: string
  /** Its code-stats group, from the change's report. */
  group: FileGroup
  /** New-file line numbers added by this change. */
  added: ReadonlySet<number>
}

/** A flag before its group is known; the orchestrator fills `group` in. */
export type RawFlag = Omit<PrepFlag, 'group'>
