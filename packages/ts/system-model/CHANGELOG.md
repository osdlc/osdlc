# @osdlc/system-model

## 0.2.0

Released in the development repository only; never published to npm.

### Minor Changes

- **Saved views.** The `./saved-view` entry point and the `SavedViewStore`
  port that keeps named views of a system graph.
  ([#1576](https://github.com/sksizer/dev/pull/1576))

## 0.1.0

Released in the development repository only; never published to npm.

### Minor Changes

- **The system model as one contract.** `SystemGraph`, `SystemNode` and
  `SystemEdge` as they cross the wire (`./graph`), the `NodeKind`, `DepKind`,
  `SpecifierKind` and `Ecosystem` unions with their `ALL_*` rosters, the
  one-method `SystemGraphClient` port a host satisfies to serve the graph
  (`./client`), and the aspect types (`./aspect`). Types and API only, no
  runtime dependencies. ([#1565](https://github.com/sksizer/dev/pull/1565))
