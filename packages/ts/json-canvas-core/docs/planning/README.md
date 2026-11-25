# json-canvas-core planning

Why `@osdlc/json-canvas-core` has the shape it has, and the work still open on it. The
[README](../../README.md) says how to use the package.

These files are maintained in [osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a
pull request there.

## Layout

| Folder                     | Holds                                         | Ids    |
| -------------------------- | --------------------------------------------- | ------ |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nn` |
| [`tasks/`](tasks/)         | Work, open or done                            | `T-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort. They are never
reused. Entries link to each other with relative links.

Each entry has a `state`. A decision is `proposed`, `accepted` or `superseded`; a superseded
decision names the one that replaces it. A task is `open` or `done`.

## Decisions

- [D-01](decisions/D-01-name-and-scope.md): Name and scope
- [D-02](decisions/D-02-api-for-the-first-release.md): The API for the first release (proposed)
- [D-03](decisions/D-03-version-line-and-stability.md): Version line and stability
- [D-04](decisions/D-04-operations-return-a-result.md): Operations return a result value
- [D-05](decisions/D-05-immutable-through-immer.md): Canvases are immutable through immer
- [D-06](decisions/D-06-checkpoints-are-opaque-handles.md): Checkpoints are opaque handles
- [D-07](decisions/D-07-validation-is-separate-from-the-typed-canvas.md): Validation is separate
  from the typed canvas
- [D-08](decisions/D-08-framework-agnostic-with-one-dom-shaped-helper.md): Framework-agnostic, with
  one DOM-shaped helper
- [D-09](decisions/D-09-interface-names-keep-the-i-prefix.md): Interface names keep the `I` prefix
- [D-10](decisions/D-10-the-rust-crate-is-independent.md): A Rust crate for the format is
  independent
- [D-11](decisions/D-11-code-from-vue-json-canvas.md): Some code descends from vue-json-canvas, and
  its MIT notice ships

## Open tasks

- [T-01](tasks/T-01-checkpoints-name-a-state.md): Checkpoints name a state
- [T-02](tasks/T-02-hit-testing-follows-paint-order.md): Hit testing follows paint order
- [T-03](tasks/T-03-generated-ids-can-collide.md): Generated ids can collide
