# detect-harness planning

Why `@osdlc/detect-harness` has the shape it has. The
[README](../../README.md) says how to use the package. This folder says why.

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

- [D-01](decisions/D-01-name.md): Package name
- [D-02](decisions/D-02-read-only.md): Read-only, with no program run unless
  asked
- [D-03](decisions/D-03-secret-redaction.md): Secret redaction
- [D-04](decisions/D-04-harnesses-and-ids.md): The six harnesses and their ids
- [D-05](decisions/D-05-report-model-and-experimental-entries.md): The report
  model and the experimental entries
- [D-06](decisions/D-06-platforms-and-runtimes.md): Platforms and runtimes
- [D-07](decisions/D-07-licence.md): Licence
