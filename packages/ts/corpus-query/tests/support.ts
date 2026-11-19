/** The corpora the tests read, by path, each loaded once. */
import { join } from 'node:path'

import { type LoadedCorpus, loadCorpus } from '@osdlc/corpus-schema'

const REPO = join(import.meta.dirname, '../../../..')
const CONFORMANCE = join(REPO, 'packages/conformance/corpus-schema/corpora')

/** This package's own fixture: books and authors, with numbers, dates, lists and references. */
export const LIBRARY = join(import.meta.dirname, 'fixtures/library')
/** A corpus that names one other corpus as `base` (extends) and as `org` (references). */
export const XREF = join(CONFORMANCE, 'references-xref')
/** The spec's own example: one type, with a record in a nested folder. */
export const STANDARD = join(CONFORMANCE, 'standard-example')
/** The harness reference: a few thousand records. */
export const HARNESS = join(REPO, 'packages/corpora/harness-reference/corpus')

const loaded = new Map<string, LoadedCorpus>()

export function corpus(root: string): LoadedCorpus {
  let model = loaded.get(root)
  if (model === undefined) loaded.set(root, (model = loadCorpus(root)))
  return model
}
