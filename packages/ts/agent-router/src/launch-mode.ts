import type { CatalogueQuery } from './catalogue/query.ts'

/**
 * The launch mode a tool needs to reach a model's provider: the catalogue's `via`. Codex reaches
 * ollama and lmstudio only as `codex --oss --local-provider <provider>`; without the flags it
 * sends the model to OpenAI.
 */
export type LaunchMode = {
  /** The mode's flags, in order (`['--oss', '--local-provider', 'ollama']`). */
  args: string[]
  /** The name the tool is handed under the mode: the offering's `native_name`, else the id (`gemma3:4b`). */
  model: string
  /** The model as `provider/id` (`ollama/gemma3:4b`): what ran, for the record. */
  key: string
}

/**
 * A `via` as argv: the catalogue writes it as one string of whitespace-separated
 * flags. A blank `via` (the schema refuses one) is no flags, `[]`.
 */
export function viaArgs(via: string): string[] {
  const text = via.trim()
  return text === '' ? [] : text.split(/\s+/)
}

/**
 * The launch mode `tool` needs to run `model`, or `undefined` when it needs
 * none. A model the catalogue holds takes its offering's `via` and
 * `native_name`. A model it lacks (a local model no refresh has listed), named
 * `provider/id`, takes the mode `tool` serves `provider` with and is handed
 * `id`.
 */
export function launchMode(
  query: CatalogueQuery,
  tool: string,
  model: string,
): LaunchMode | undefined {
  const found = query.findModel(tool, model)
  if (found !== undefined) {
    const via = found.offering.via
    return via === undefined
      ? undefined
      : { args: viaArgs(via), model: found.offering.native_name, key: found.model.key }
  }
  const slash = model.indexOf('/')
  if (slash <= 0) return undefined
  const provider = model.slice(0, slash)
  for (const entry of query.tool(tool)?.serves ?? []) {
    if (typeof entry !== 'string' && entry.provider === provider) {
      return { args: viaArgs(entry.via), model: model.slice(slash + 1), key: model }
    }
  }
  return undefined
}
