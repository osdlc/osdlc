/**
 * The harness model: a JSON-safe description of a coding-agent plugin.
 *
 * A "harness" here is what a coding agent runs inside: the capabilities it can
 * invoke, the context it carries, the tools it may use, the MCP servers it can
 * reach, the permissions that limit it, and the lifecycle hooks that run around
 * it. This module holds the shape of that description. It is read
 * from a Claude Code plugin folder by {@link readPlugin} in
 * `./derive.ts`.
 *
 * The model is a plain, JSON-serializable Zod shape, so it is also its own
 * exchange format. Zod is a peer dependency: the schemas are public, and a
 * consumer that nests them in its own schemas needs one copy of Zod.
 *
 * Runtime-agnostic: pure schema, no `node:`/Bun coupling.
 */

import { z } from 'zod'

/**
 * Schema version of the model. `HarnessModelSchema` accepts only this value.
 *
 * @experimental
 */
export const HARNESS_MODEL_VERSION = '2' as const

/**
 * Plugin identity, from the plugin manifest.
 *
 * @experimental
 */
export const HarnessMetadataSchema = z.object({
  /** Machine name or plugin id (kebab-case), e.g. `"my-plugin"`. */
  name: z.string().min(1),
  /** A version string, usually semver, or `"unknown"`. */
  version: z.string().min(1),
  /** One-paragraph human description. */
  description: z.string().default(''),
  /** Author name, when the source manifest declares one. */
  author: z.string().optional(),
  /** Project homepage or repo URL, when declared. */
  homepage: z.string().optional(),
})
/**
 * The plugin's name, version and descriptive fields.
 *
 * @experimental
 */
export type HarnessMetadata = z.infer<typeof HarnessMetadataSchema>

/**
 * A file next to a capability (a helper script, a fixture). Contents are kept as
 * text, since these files are markdown and source scripts, never binary. The
 * executable bit is kept so a launcher script stays runnable.
 *
 * @experimental
 */
export const HarnessResourceSchema = z.object({
  /** Path relative to the capability's own directory (e.g. `"start_task.ts"`). */
  path: z.string().min(1),
  /** File contents, verbatim. */
  contents: z.string(),
  /** True when the source file carried a user-executable bit. */
  executable: z.boolean().default(false),
})
/**
 * A file that ships with a skill or command.
 *
 * @experimental
 */
export type HarnessResource = z.infer<typeof HarnessResourceSchema>

/**
 * A capability's kind. `skill` is a model-invoked capability; `command` is a
 * user-invoked one (a `/name` slash command). Claude Code separates the two, so
 * the model keeps the distinction.
 *
 * @experimental
 */
export const CapabilityKindSchema = z.enum(['skill', 'command'])
/**
 * Whether a capability is a `skill` or a `command`.
 *
 * @experimental
 */
export type CapabilityKind = z.infer<typeof CapabilityKindSchema>

/**
 * A capability an agent or user can invoke. `name` is the kebab-case id and the
 * last part of the invocation name. `instructions` is the markdown the agent
 * follows, `allowedTools` the permitted tools, and `argumentHint` the CLI-style
 * hint for commands that take arguments. `annotations` holds the frontmatter
 * keys the model has no field for.
 *
 * @experimental
 */
export const HarnessCapabilitySchema = z.object({
  /** Kebab id, unique within the harness (`"task-work"`). */
  name: z.string().min(1),
  /** skill (model-invoked) or command (user-invoked). */
  kind: CapabilityKindSchema.default('skill'),
  /** A summary: what it does and when to use it. */
  description: z.string().default(''),
  /** Markdown instruction body the agent follows. */
  instructions: z.string().default(''),
  /** Tools the capability is permitted to use. */
  allowedTools: z.array(z.string()).default([]),
  /** CLI-style argument hint, for commands that take arguments. */
  argumentHint: z.string().optional(),
  /** Helper files next to the capability, by path relative to it. */
  resources: z.array(HarnessResourceSchema).default([]),
  /** Frontmatter keys with no field of their own (e.g. `need_human_review`). */
  annotations: z.record(z.string(), z.unknown()).default({}),
})
/**
 * A skill or command, with its instructions, resources and annotations.
 *
 * @experimental
 */
export type HarnessCapability = z.infer<typeof HarnessCapabilitySchema>

/**
 * A lifecycle hook: a shell `action` run on `event` (e.g. `PreToolUse`,
 * `Stop`, `SessionStart`), optionally limited by a `matcher` (a tool-name or
 * event pattern).
 *
 * @experimental
 */
export const HarnessHookSchema = z.object({
  /** Lifecycle event name, in Claude Code's own spelling. */
  event: z.string().min(1),
  /** Optional matcher (tool name or pattern) that limits when the hook runs. */
  matcher: z.string().optional(),
  /** The shell command to run. */
  action: z.string().min(1),
})
/**
 * A hook declared by the plugin or its settings.
 *
 * @experimental
 */
export type HarnessHook = z.infer<typeof HarnessHookSchema>

/**
 * MCP transport kind.
 *
 * @experimental
 */
export const McpTransportSchema = z.enum(['stdio', 'http', 'sse'])
/**
 * The transport of an MCP server: `stdio`, `http` or `sse`.
 *
 * @experimental
 */
export type McpTransport = z.infer<typeof McpTransportSchema>

/**
 * An MCP server the harness can reach. `stdio` servers carry `command`/`args`/
 * `env`. `http`/`sse` servers carry `url` and optional `headers`. Nothing checks
 * that a server has the fields of its transport.
 *
 * The readers replace `env` and `headers` values, the user part and query
 * values of `url`, and secret-looking `args`, with `"<redacted>"` unless asked
 * to keep them.
 *
 * @experimental
 */
export const HarnessMcpServerSchema = z.object({
  /** Server id, unique within the harness. */
  name: z.string().min(1),
  transport: McpTransportSchema.default('stdio'),
  /** stdio: the binary to launch. */
  command: z.string().optional(),
  /** stdio: launch arguments. */
  args: z.array(z.string()).default([]),
  /** stdio: environment overrides (values redacted by default). */
  env: z.record(z.string(), z.string()).default({}),
  /** http/sse: the endpoint URL. */
  url: z.string().optional(),
  /** http/sse: request headers (values redacted by default). */
  headers: z.record(z.string(), z.string()).default({}),
})
/**
 * An MCP server declared by the plugin or its settings.
 *
 * @experimental
 */
export type HarnessMcpServer = z.infer<typeof HarnessMcpServerSchema>

/**
 * Tool permission rule sets: the `allow`/`deny`/`ask` lists of Claude settings.
 * Rules are tool patterns (`"Bash(git *)"`). Rules from every settings scope are
 * kept.
 *
 * @experimental
 */
export const HarnessPermissionsSchema = z.object({
  allow: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
  ask: z.array(z.string()).default([]),
})
/**
 * Allow, deny and ask rules, and the default mode.
 *
 * @experimental
 */
export type HarnessPermissions = z.infer<typeof HarnessPermissionsSchema>

/**
 * A shared context document the capabilities draw on, read from a documents
 * folder (`conventions/` by default).
 *
 * @experimental
 */
export const HarnessDocumentSchema = z.object({
  /** Path under the documents folder, without `.md` (`"commit-messages"`). */
  name: z.string().min(1),
  /** Full markdown document, verbatim. */
  body: z.string().default(''),
})
/**
 * A shared context document: a markdown file under the documents folder.
 *
 * @experimental
 */
export type HarnessDocument = z.infer<typeof HarnessDocumentSchema>

/**
 * The whole model: what {@link readPlugin} produces from a Claude Code
 * plugin folder.
 *
 * @experimental
 */
export const HarnessModelSchema = z.object({
  /** Model schema version. See {@link HARNESS_MODEL_VERSION}. */
  modelVersion: z.literal(HARNESS_MODEL_VERSION).default(HARNESS_MODEL_VERSION),
  metadata: HarnessMetadataSchema,
  /** Capabilities, sorted by `name` for a deterministic emit. */
  capabilities: z.array(HarnessCapabilitySchema).default([]),
  /** Lifecycle hooks. */
  hooks: z.array(HarnessHookSchema).default([]),
  /** MCP servers, sorted by `name`. */
  mcpServers: z.array(HarnessMcpServerSchema).default([]),
  /** Tool permissions. */
  permissions: HarnessPermissionsSchema.default({ allow: [], deny: [], ask: [] }),
  /** Shared context documents, sorted by `name`. */
  documents: z.array(HarnessDocumentSchema).default([]),
})
/**
 * The typed model of one plugin folder.
 *
 * @experimental
 */
export type HarnessModel = z.infer<typeof HarnessModelSchema>

/**
 * The total number of resource files across every capability.
 *
 * @experimental
 */
export function countResources(model: HarnessModel): number {
  return model.capabilities.reduce((n, c) => n + c.resources.length, 0)
}

/**
 * Capabilities of a given kind, in model order.
 *
 * @experimental
 */
export function capabilitiesOfKind(model: HarnessModel, kind: CapabilityKind): HarnessCapability[] {
  return model.capabilities.filter((c) => c.kind === kind)
}
