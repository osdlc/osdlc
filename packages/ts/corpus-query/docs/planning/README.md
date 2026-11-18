# corpus-query planning

Why `@osdlc/corpus-query` has the shape it has. The [README](../../README.md) says how to use the
package. This folder says why it is shaped as it is.

These files are maintained here, in [osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue
or a pull request there.

## Layout

| Folder                     | Holds                                         | Ids    |
| -------------------------- | --------------------------------------------- | ------ |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort. They are never
reused. Each decision has a `state`: `proposed`, `accepted` or `superseded`. A proposed decision
waits for the owner's sign-off.

## Decisions

- [D-01](decisions/D-01-one-core-four-surfaces.md): One core, four surfaces
- [D-02](decisions/D-02-query-shape-and-string-form.md): The query shape and its string form
- [D-03](decisions/D-03-mcp-and-rest-on-their-own-servers.md): MCP and REST on their own servers
- [D-04](decisions/D-04-search-without-an-index.md): Search without an index
