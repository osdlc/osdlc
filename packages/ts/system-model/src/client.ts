import type { SystemGraph } from './graph.ts'

/**
 * The API a host must satisfy to feed a system-graph surface.
 *
 * One method, because the surface needs one thing: the whole graph. Folding a
 * container is an interaction, not a query — the aggregation that makes
 * collapse work runs client-side over this payload — so there is no second
 * call for "the graph, but collapsed".
 *
 * Stating it here rather than inside a viewer is what lets a host be written
 * against the contract without depending on the viewer, and lets a viewer be
 * written without knowing which host it will run in. Two hosts satisfy it
 * today and they share no code: SDF reaches the Rust `manifest-graph` crate
 * through ontogen's generated transport, and `product-system-graph` calls the
 * crate's TypeScript peer in-process over one Nitro route.
 */
export interface SystemGraphClient {
  /**
   * The project's structure. `includeExternal` also materialises the registry
   * packages it depends on, gathered under one node per ecosystem.
   */
  graph(includeExternal: boolean): Promise<SystemGraph>
}
