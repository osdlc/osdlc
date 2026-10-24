/**
 * What the build system knows about a project that a manifest cannot say.
 *
 * A `package.json` says something is TypeScript. Only the project graph says it
 * is a *frontend application* rather than a *backend library* — a role
 * taxonomy, and a better one than anything derivable from a manifest, because
 * it is the taxonomy CI actually gates on.
 *
 * DELIBERATELY NOT ON `SystemNode`. The walkers read manifests off a disk and
 * nothing else; teaching them to shell out to a build tool would put a
 * moon-shaped dependency inside a general library about manifests, and would
 * make the two walkers' byte-identical output depend on a subprocess. So this
 * arrives beside the graph instead, through a port a host satisfies, and is
 * joined to nodes by directory.
 *
 * The port is OPTIONAL. A host that cannot answer is not broken — it just has
 * no role taxonomy, and the surface withholds the controls that would read one
 * rather than painting the whole map `unmapped`.
 */

/** One project's role, as the build system understands it. */
export interface ProjectFacets {
  /** The build system's own project id. Not a `SystemNode.id`. */
  id: string
  /**
   * Repo-relative directory, and the join key.
   *
   * Directory rather than name, because the two namespaces do not line up: a
   * moon project id is `agent-adapt` where the node id is `@osdlc/agent-adapt`,
   * and some manifests have no name at all. The directory is the one thing both
   * sides agree on, and it is what `SystemNode.dir` already carries.
   */
  dir: string
  /** `application` | `library` | `tool` | `unknown`, or whatever it learns. */
  layer: string
  /** `frontend` | `backend` | `unknown`. */
  stack: string
  language: string
}

/**
 * The optional port a host satisfies to supply {@link ProjectFacets}.
 *
 * Read once at load, like the graph itself — the taxonomy changes when someone
 * edits workspace config, not while a map is being read.
 */
export interface ProjectFacetsStore {
  list(): Promise<ProjectFacets[]>
}
