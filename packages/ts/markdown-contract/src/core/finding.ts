/** The error `Contract.read()` throws. */
import type { Finding } from './types.js'

/**
 * The error `Contract.read()` throws when a document has an error-level finding. `findings`
 * holds those findings, so a `catch` can report them.
 */
export class ContractError extends Error {
  /** The document's error-level findings. */
  readonly findings: Finding[]

  /**
   * @param findings The error-level findings.
   * @param message The error message. Default: the number of findings.
   */
  constructor(findings: Finding[], message?: string) {
    super(message ?? `contract validation failed with ${findings.length} finding(s)`)
    this.name = 'ContractError'
    this.findings = findings
  }
}
