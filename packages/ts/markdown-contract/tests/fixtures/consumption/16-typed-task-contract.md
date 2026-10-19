# Make table() generic over its declared cells

Thread a `cells` map through `table()` so a declared column reads back its
transformed value instead of the raw string.

## Files to touch

| Location                                     | Kind   | Change                                |
| -------------------------------------------- | ------ | ------------------------------------- |
| `packages/core/src/core/leaves.ts#table`     | modify | thread `cells` through the row type   |
| `packages/core/src/core/model.ts#tableView`  | modify | read the typed overlay in `tableView` |
| `packages/core/src/core/types.ts#RowOf`      | new    | add the generic `RowOf` helper type   |
| `packages/core/src/legacy/table-shim.ts`     | delete | drop the pre-generic shim             |

## Dependencies

- T-SCTC: capture the transform output on the table node
- T-SCRB: read the typed rows back through the model
- T-SCPP: preserve per-cell source positions
