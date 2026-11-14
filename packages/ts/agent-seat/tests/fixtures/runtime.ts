import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** A scratch runtime directory for hosts that keep state, one per test file. */
export const RUNTIME = mkdtempSync(join(tmpdir(), 'agent-seat-runtime-'))
