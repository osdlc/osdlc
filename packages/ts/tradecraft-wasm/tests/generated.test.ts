/**
 * The wire types in src/core.generated.ts come from the Rust source through
 * tradecraft-typegen, which commits its output in the crate. This test fails
 * when the package's copy differs from the crate's, so a regenerated file that
 * was not copied here is caught.
 *
 * The crate's own test (`cargo test -p tradecraft-typegen`) fails when the
 * crate's file is behind the Rust source.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from 'vitest'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const CRATE_COPY = join(PACKAGE_DIR, '../../rust/tradecraft-typegen/generated/core.generated.ts')

test.skipIf(!existsSync(CRATE_COPY))(
  "src/core.generated.ts equals tradecraft-typegen's output",
  () => {
    expect(readFileSync(join(PACKAGE_DIR, 'src/core.generated.ts'), 'utf-8')).toBe(
      readFileSync(CRATE_COPY, 'utf-8'),
    )
  },
)
