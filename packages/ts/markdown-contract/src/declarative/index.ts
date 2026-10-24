/**
 * `@osdlc/markdown-contract/declarative`: contracts and configs written as YAML.
 *
 * A YAML contract (`mcVersion: 2`) compiles to the same `Contract` that `contract(...)`
 * builds, so it gives the same findings and the same typed model. It covers frontmatter,
 * structure, content and text checks. Custom `rule` / `docRule` functions need code.
 * Files in the old `mcVersion: 1` format are rejected. `markdown-contract migrate`
 * rewrites them.
 *
 * This entry reads files, so it needs Node.
 */

export { loadConfig, loadConfigFile } from './config.js'
export { DeclarativeError } from './errors.js'
export type { InferOptions, InferResult, InferredContract, InferredFile } from './infer.js'
export { inferConfig } from './infer.js'
export { compileContractObject, loadContract, loadContractFile } from './load.js'
