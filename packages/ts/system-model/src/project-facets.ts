/**
 * What the build system knows about a project that a manifest cannot say.
 *
 * A `package.json` says something is TypeScript. Only the build system's
 * project graph says it is a frontend application rather than a backend
 * library. These roles are better than anything a manifest gives, because CI
 * checks against them.
 *
 * Deliberately not on `SystemNode`. The walkers read only manifests from disk.
 * Making them run a build tool would put a moon dependency inside a general
 * library about manifests. It would also make the two walkers' byte-identical
 * output depend on a subprocess. So facets come beside the graph instead,
 * through a port a host implements, and are joined to nodes by directory.
 *
 * The port is optional. A host that cannot supply facets is not broken. It
 * has no roles, and the viewer hides the controls that use them instead of
 * marking every node `unmapped`.
 */

/** One project's role, as the build system understands it. */
export interface ProjectFacets {
  /** The build system's own project id. Not a `SystemNode.id`. */
  id: string
  /**
   * Repo-relative directory, and the join key.
   *
   * Directory rather than name, because the two sets of names differ. A moon
   * project id is `agent-adapt` where the node id is `@osdlc/agent-adapt`, and
   * some manifests have no name at all. Both sides agree on the directory, and
   * `SystemNode.dir` already holds it.
   */
  dir: string
  /** `application` | `library` | `tool` | `unknown`, or a value added later. */
  layer: string
  /** `frontend` | `backend` | `unknown`. */
  stack: string
  language: string
}

/**
 * The optional port a host implements to supply {@link ProjectFacets}.
 *
 * Read once at load, like the graph. The roles change when someone edits the
 * workspace config, not while a viewer is open.
 */
export interface ProjectFacetsStore {
  list(): Promise<ProjectFacets[]>
}
