// The shared benchmark corpus: a synthetic vault and the slow-input cases.
// Both the TypeScript benchmarks (vitest bench) and the Rust ones (criterion,
// through the file `cli.ts` writes) read this one corpus, so the twins are
// timed on the same bytes.
import { type Note, type VaultOptions, generateVault } from './generate.ts'
import { type SlowInput, slowInputs } from './slow-inputs.ts'

export { type Note, type SlowInput, type VaultOptions, generateVault, slowInputs }

/** The whole corpus. */
export interface Corpus {
  /** Every note of the synthetic vault. */
  notes: Note[]
  /** The bodies of `notes`, in order. */
  bodies: string[]
  /** The largest body in the vault. */
  largest: string
  /** The pathological inputs. */
  slow: SlowInput[]
}

/** Build the corpus. The defaults are what the gated benchmarks use. */
export function corpus(options: VaultOptions = {}): Corpus {
  const notes = generateVault(options)
  const bodies = notes.map((n) => n.body)
  const largest = bodies.reduce((a, b) => (b.length > a.length ? b : a), '')
  return { notes, bodies, largest, slow: slowInputs() }
}
