/**
 * What a settings screen and `way providers` say about a tool: what it is,
 * its homepage and its language, from `@osdlc/system-model`'s `ToolDef`.
 */

import type { ProviderKind, ToolDef } from '@osdlc/system-model/detect'

import { languageLabel } from './vocabulary.ts'

/** One tool's description, homepage and language. */
export interface ToolSummary {
  id: string
  /**
   * The project's site, `https://` or `http://` only, so a page can link it.
   * Null for a custom tool that sets none or sets another scheme.
   */
  homepage: string | null
  /** One sentence on what the tool is. Null for a custom tool that sets none. */
  description: string | null
  /** The ecosystem id, such as `node`. Null for a tool of no one language. */
  ecosystem: string | null
  /** The language a person reads: `JavaScript`, or `any language` (see `languageLabel`). */
  language: string
  /** The runner role's kind: `exec` needs trust to be read. Null with no runner role. */
  runnerKind: ProviderKind | null
}

/** The summary of `tool`. A custom tool's `homepage` and `description` are repository text. */
export function toolSummary(tool: ToolDef): ToolSummary {
  const ecosystem = tool.ecosystem?.id ?? null
  return {
    id: tool.id,
    homepage:
      tool.homepage !== undefined && /^https?:\/\//i.test(tool.homepage) ? tool.homepage : null,
    description: tool.description ?? null,
    ecosystem,
    language: languageLabel(ecosystem),
    runnerKind: tool.roles.runner?.kind ?? null,
  }
}
