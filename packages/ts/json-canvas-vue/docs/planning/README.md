# json-canvas-vue planning

Why `@osdlc/json-canvas-vue` has the shape it has, and the work still open on it. The
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

- [D-01](decisions/D-01-name.md): Name
- [D-02](decisions/D-02-alternatives-considered.md): Alternatives considered (proposed)
- [D-03](decisions/D-03-api-for-the-first-release.md): The API for the first release (proposed)
- [D-04](decisions/D-04-version-line-and-stability.md): Version line and stability
- [D-05](decisions/D-05-build-and-stylesheet.md): Build: compiled `dist/` and one stylesheet
- [D-06](decisions/D-06-browsers.md): Supported browsers
- [D-07](decisions/D-07-host-contract.md): The host contract
- [D-08](decisions/D-08-markdown-seam-and-sanitizing.md): The markdown seam and sanitizing
- [D-09](decisions/D-09-code-from-vue-json-canvas.md): Some code descends from vue-json-canvas, and
  its MIT notice ships

## Open tasks

- [T-01](tasks/T-01-per-board-markdown-renderer.md): A per-board markdown renderer
- [T-02](tasks/T-02-test-in-a-real-browser.md): Test in a real browser
- [T-03](tasks/T-03-drop-the-declarations-step.md): Drop the declarations step
