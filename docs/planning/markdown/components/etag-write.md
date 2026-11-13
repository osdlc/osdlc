---
name: "@osdlc/etag-write"
kind: package
language: ts
layer: "[files](../layers/files.md)"
states: [present, target]
status: published
version: "0.3.1"
registry: "https://www.npmjs.com/package/@osdlc/etag-write"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/ts/etag-write
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/ts/etag-write
twin: "[etag-write-rs](etag-write-rs.md)"
---

Writes a file atomically and refuses to overwrite it if someone else changed it since it was read.
Used to save notes without losing edits.

## Notes

- Its tests live in the package. There is no shared conformance family for it yet.
