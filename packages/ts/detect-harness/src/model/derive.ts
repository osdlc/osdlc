/**
 * `readPlugin`: read a Claude Code plugin folder into the {@link HarnessModel}.
 *
 * Sources under `<pluginRoot>/`:
 *   - `.claude-plugin/plugin.json`  → `metadata`, and its inline or referenced
 *     `hooks` and `mcpServers`
 *   - `skills/<name>/SKILL.md`      → one `skill` each (frontmatter normalized,
 *     body kept, other non-test files in the folder kept as `resources`)
 *   - `commands/<name>/SKILL.md` and flat `commands/<name>.md` → one `command` each
 *   - `<documentsDir>/**\/*.md`      → one `document` each (default `conventions`)
 *   - `hooks/hooks.json`, `.claude/settings{,.local}.json`, `.mcp.json` → hooks,
 *     MCP servers and permissions (see `./control-plane.ts`)
 *
 * Skills and commands are found and named by `scanPluginArtifacts`, the reader
 * `detect()` uses for an installed plugin, so both list the same ones.
 *
 * MCP secrets are redacted unless `includeValues` is set.
 *
 * Runtime-agnostic: `node:` APIs only.
 */

import { existsSync, readFileSync, readdirSync, realpathSync, statSync, type Dirent } from 'node:fs'
import { dirname, join, relative } from 'node:path'

import type { DirEntry, TextRead } from '../contract.ts'
import {
  argumentHintOf,
  frontmatterString,
  parseFrontmatter,
  splitFrontmatter,
} from '../frontmatter.ts'
import { loadJson } from '../json.ts'
import { scanPluginArtifacts, type ArtifactReader } from '../read/artifacts.ts'

import {
  HARNESS_MODEL_VERSION,
  HarnessModelSchema,
  type HarnessCapability,
  type HarnessDocument,
  type HarnessModel,
  type HarnessResource,
} from './schema.ts'
import { readPluginControlPlane, type ControlPlaneOptions } from './control-plane.ts'

/** Frontmatter keys the model turns into fields of their own. */
const NORMALIZED_KEYS = new Set(['description', 'allowed-tools', 'argument-hint'])

/** Coerce a frontmatter `allowed-tools` value to a string[]. */
function asToolList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v))
  if (typeof value === 'string') {
    // Also accept a single string separated by commas or newlines.
    return value
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

/** Every regular file under `dir` as `/`-joined paths relative to `dir`, sorted. */
function walkFiles(dir: string): string[] {
  const out: string[] = []
  const rec = (d: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = join(d, e.name)
      if (e.isDirectory()) rec(abs)
      else if (e.isFile()) out.push(relative(dir, abs).split('\\').join('/'))
    }
  }
  rec(dir)
  return out
}

/** True when a path relative to the skill is a resource file (not SKILL.md or a test). */
function isResourcePath(rel: string): boolean {
  if (rel === 'SKILL.md') return false
  const segments = rel.split('/')
  if (segments.includes('tests')) return false
  if (segments.some((s) => s.endsWith('.test.ts') || s.endsWith('.test.js'))) return false
  return true
}

/** Build a {@link HarnessCapability} from a SKILL.md or command file's text. */
function capabilityFromText(
  text: string,
  name: string,
  kind: HarnessCapability['kind'],
  resources: HarnessResource[],
): HarnessCapability {
  const [, body] = splitFrontmatter(text)
  const fm = parseFrontmatter(text) ?? {}

  const annotations: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fm)) {
    if (!NORMALIZED_KEYS.has(k)) annotations[k] = v
  }

  const argumentHint = argumentHintOf(fm)

  return {
    name,
    kind,
    description: frontmatterString(fm['description']),
    instructions: body.replace(/^\n+/, ''),
    allowedTools: asToolList(fm['allowed-tools']),
    ...(argumentHint !== null ? { argumentHint } : {}),
    resources,
    annotations,
  }
}

/** The resource files of the skill or command folder `dir`. */
function resourcesOf(dir: string): HarnessResource[] {
  const resources: HarnessResource[] = []
  for (const rel of walkFiles(dir)) {
    if (!isResourcePath(rel)) continue
    const abs = join(dir, rel)
    resources.push({
      path: rel,
      contents: readFileSync(abs, 'utf-8'),
      executable: (statSync(abs).mode & 0o100) !== 0,
    })
  }
  return resources
}

/** An error code that means the path is not there to read. */
function isAbsent(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code
  return code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR'
}

/**
 * An {@link ArtifactReader} over the file system. Unlike `detect()`'s context it
 * throws on a file or folder that exists but cannot be read, so a plugin is
 * never read with a capability silently missing. Reads are memoized.
 */
function fsReader(): ArtifactReader {
  const texts = new Map<string, TextRead>()
  return {
    readContents: false,
    readText: (path) => {
      const hit = texts.get(path)
      if (hit) return hit
      let read: TextRead
      try {
        read = { status: 'parsed', text: readFileSync(path, 'utf-8') }
      } catch (err) {
        if (!isAbsent(err)) throw err
        read = { status: 'absent' }
      }
      texts.set(path, read)
      return read
    },
    listDir: (path) => {
      let entries: Dirent[]
      try {
        entries = readdirSync(path, { withFileTypes: true })
      } catch (err) {
        if (isAbsent(err)) return []
        throw err
      }
      return entries
        .map((e): DirEntry => {
          // Follow a symbolic link to learn what it points at; a dangling one is neither.
          if (!e.isSymbolicLink()) {
            return { name: e.name, isFile: e.isFile(), isDirectory: e.isDirectory() }
          }
          try {
            const st = statSync(join(path, e.name))
            return { name: e.name, isFile: st.isFile(), isDirectory: st.isDirectory() }
          } catch {
            return { name: e.name, isFile: false, isDirectory: false }
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    realpath: (path) => {
      try {
        return realpathSync(path)
      } catch {
        return null
      }
    },
  }
}

/** Read a documents folder into {@link HarnessDocument}s named by their path under it. */
function deriveDocuments(documentsDir: string): HarnessDocument[] {
  if (!existsSync(documentsDir)) return []
  const docs: HarnessDocument[] = []
  for (const rel of walkFiles(documentsDir)) {
    if (!rel.endsWith('.md')) continue
    docs.push({
      name: rel.replace(/\.md$/, ''),
      body: readFileSync(join(documentsDir, rel), 'utf-8'),
    })
  }
  return docs
}

/** Load `.claude-plugin/plugin.json` (or a bare `plugin.json`) as a plain object; `{}` when there is none. */
function loadManifest(pluginRoot: string): Record<string, unknown> {
  return (
    loadJson(join(pluginRoot, '.claude-plugin', 'plugin.json')) ??
    loadJson(join(pluginRoot, 'plugin.json')) ??
    {}
  )
}

/**
 * Options for {@link readPlugin}.
 *
 * @experimental
 */
export interface ReadPluginOptions extends ControlPlaneOptions {
  /**
   * Folder under the plugin root whose `.md` files become the model's documents,
   * each named by its path under the folder without `.md`. Default `conventions`.
   */
  documentsDir?: string
}

/**
 * Derive the {@link HarnessModel} from the Claude Code plugin folder at
 * `pluginRoot`. Capabilities, documents, hooks and servers are sorted, so the
 * output is stable and easy to diff. The result is parsed through
 * {@link HarnessModelSchema}, so a malformed source fails here with a schema
 * error, not later in the caller.
 *
 * A missing or unreadable `plugin.json` is not an error: the metadata then reads
 * `harness` and `unknown`.
 *
 * @throws {ZodError} When the derived model fails {@link HarnessModelSchema}.
 * @throws {Error} What `readFileSync` or `readdirSync` throws for a folder or file
 * that exists but cannot be read.
 *
 * @experimental
 */
export function readPlugin(pluginRoot: string, options: ReadPluginOptions = {}): HarnessModel {
  const manifest = loadManifest(pluginRoot)
  const author = manifest['author']
  const authorName =
    author && typeof author === 'object' && 'name' in author
      ? String((author as Record<string, unknown>)['name'])
      : typeof author === 'string'
        ? author
        : undefined

  // Skills (model-invoked) live under `skills/`, commands (user-invoked) under
  // `commands/`. A skill is a folder holding SKILL.md. A command is either such
  // a folder or a flat `<name>.md`; the folder wins when both have one name.
  const reader = fsReader()
  const found = scanPluginArtifacts(reader, pluginRoot, {
    scope: 'user',
    origin: 'plugin',
    managerOwned: true,
  })
  const capabilities: HarnessCapability[] = []
  for (const [dir, kind, artifacts] of [
    ['skills', 'skill', found.skills],
    ['commands', 'command', found.commands],
  ] as const) {
    for (const a of artifacts) {
      const read = reader.readText(a.path)
      if (read.status !== 'parsed') continue
      // A flat command sits in the kind folder itself and has no resources.
      const folder = dirname(a.path)
      const resources = folder === join(pluginRoot, dir) ? [] : resourcesOf(folder)
      capabilities.push(capabilityFromText(read.text, a.name, kind, resources))
    }
  }
  capabilities.sort((a, b) => a.name.localeCompare(b.name))

  const documents = deriveDocuments(join(pluginRoot, options.documentsDir ?? 'conventions'))

  // Hooks, MCP servers and permissions come from the plugin's own files and from
  // the root's Claude settings. A root with none contributes nothing.
  const controlPlane = readPluginControlPlane(pluginRoot, manifest, options)

  return HarnessModelSchema.parse({
    modelVersion: HARNESS_MODEL_VERSION,
    metadata: {
      name: String(manifest['name'] ?? 'harness'),
      version: String(manifest['version'] ?? 'unknown'),
      description: String(manifest['description'] ?? ''),
      ...(authorName ? { author: authorName } : {}),
      ...(typeof manifest['homepage'] === 'string'
        ? { homepage: manifest['homepage'] as string }
        : {}),
    },
    capabilities,
    hooks: controlPlane.hooks,
    mcpServers: controlPlane.mcpServers,
    permissions: controlPlane.permissions,
    documents,
  })
}
