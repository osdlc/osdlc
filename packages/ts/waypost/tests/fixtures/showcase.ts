/**
 * The showcase fixture, staged somewhere waypost will actually read it.
 *
 * Used by the screenshot launcher only. The frame snapshots do not collect at
 * all — they render a written-down catalog, `./showcase-catalog.ts`, because
 * they assert in CI and detection is not identical on every machine.
 *
 * The fixture is COPIED out of this repository before use, and that is not
 * tidiness. `findRoot` walks upward for a `.git` or `.moon` and returns the
 * first it finds, so a fixture left in place resolves to the monorepo root and
 * a capture of "the showcase project" photographs four thousand of waypost's
 * own tasks instead. Copied to a temp directory with no repository above it,
 * the fallback in `findRoot` lands on the fixture's own `justfile` /
 * `package.json`, which is the root a capture wants.
 *
 * (The same rule bites the other way: a temp directory under `~/.claude` has
 * `~/.claude/package.json` above it, so the fallback resolves THERE and the
 * scan never finishes. The OS temp dir has no marker above it.)
 */

import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE = fileURLToPath(new URL('./showcase', import.meta.url))

/** Stage the fixture and hand back its root plus the cleanup for it. */
export function stageShowcase(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'waypost-showcase-'))
  cpSync(SOURCE, root, { recursive: true })
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}
