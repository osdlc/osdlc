---
name: "@osdlc/path-guard"
kind: package
language: ts
layer: "[files](../layers/files.md)"
states: [present, target]
status: published
version: "0.3.1"
registry: "https://www.npmjs.com/package/@osdlc/path-guard"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/ts/path-guard
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/ts/path-guard
twin: "[path-guard-rs](path-guard-rs.md)"
---

Takes a path that came from outside (a request, a config file, a link in a note), joins it onto a
root folder, and refuses it if the result could end up outside that root. It catches `..`, absolute
paths, `~`, Windows drives and symlinks that point out of the root, and it works for files that
don't exist yet. Anything that reads or writes files under a vault or corpus root uses it.

## Notes

- It shares the path-guard conformance family with the Rust crate (packages/conformance/path-guard).
