/**
 * The pairing as it was before the similarity floor, so the experiments can
 * score it beside the current code. `operations-before.ts` holds that version
 * of `src/diff/operations.ts`.
 */
import type { pairLines } from '../../src/diff/operations.ts'
import type { FileDiff } from '../../src/diff/parse.ts'

import { pairLines as pairLinesWithNoFloor } from './operations-before.ts'

export type Pairer = (files: readonly FileDiff[]) => ReturnType<typeof pairLines>

/** `pairLines` as it was before the floor, with its defaults. */
export const pairLinesBefore: Pairer = (files) => pairLinesWithNoFloor(files)
