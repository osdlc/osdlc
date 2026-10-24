import type { SystemGraph } from './graph.ts'

/**
 * The API a host implements to supply a system-graph viewer.
 *
 * One method, because the viewer needs one thing: the whole graph. Folding a
 * container is an interaction, not a query. The aggregation for folding runs
 * on the client over this payload, so there is no second call for "the graph,
 * but collapsed".
 *
 * It is defined here, not inside a viewer. So a host can be written against
 * the contract without depending on the viewer, and a viewer can be written
 * without knowing which host it runs in. Two hosts implement it and share no
 * code. SDF reaches the Rust `manifest-graph` crate through ontogen's
 * generated transport. `product-system-graph` calls the crate's TypeScript
 * counterpart in-process over one Nitro route.
 */
export interface SystemGraphClient {
  /**
   * The project's structure. `includeExternal` also adds nodes for the
   * registry packages it depends on, grouped under one node per ecosystem.
   */
  graph(includeExternal: boolean): Promise<SystemGraph>
}
