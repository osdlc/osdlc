/**
 * Thrown when a YAML contract or config cannot be compiled: it is malformed, has an
 * unsupported `mcVersion` or `kind`, or uses a key the format does not have.
 *
 * It differs from `ContractError`, which `read()` throws when a document fails a contract.
 * A `DeclarativeError` means the YAML itself is wrong. Its `message` names the path to the
 * bad key, such as `body.sections[0].content`.
 */
export class DeclarativeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeclarativeError'
  }
}
