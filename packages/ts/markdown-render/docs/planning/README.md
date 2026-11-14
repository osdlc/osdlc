# markdown-render planning

Why `@osdlc/markdown-render` has the shape it has. The [README](../../README.md)
says how to use the package. This folder says why.

These files are maintained here, in
[osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a pull request
there.

## Layout

| Folder                     | Holds                                         | Ids    |
| -------------------------- | --------------------------------------------- | ------ |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort.
They are never reused. Each decision has a `state`: `accepted` or
`superseded`. A superseded decision names the one that replaces it.

## Decisions

- [D-01](decisions/D-01-dialect-consumes-remarks-parse.md): The dialect consumes
  remark's parse
- [D-02](decisions/D-02-input-is-a-body.md): The input is a body
- [D-03](decisions/D-03-block-ids-are-line-terminal.md): A block id is
  line-terminal
- [D-04](decisions/D-04-tag-dialect-is-an-option.md): The tag dialect is an
  option
- [D-05](decisions/D-05-links-are-placed-by-scanner-offsets.md): Links are found
  by the scanner and placed by offset
