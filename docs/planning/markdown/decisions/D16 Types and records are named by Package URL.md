---
title: Types and records are named by Package URL
status: decided
decided: "2026-11-11"
---

A type or a record in a published corpus has a global identity, written as a
[Package URL](https://github.com/package-url/purl-spec) (purl). The purl names the package and its
version, and the fragment names the type folder, then the record id:

- a type: `pkg:npm/%40osdlc/corpus-profile-sdlc@0.3.0#tasks`
- a record: `pkg:npm/%40osdlc/corpus-sdlc-starter@0.1.0#principles/P-0002`

The identity is derived from the package, its version and the type folder. Nobody writes it by
hand. Tools use it to tell records apart across corpora: a query result carries it, and one record
reached through two references is one record.

A purl was chosen over a URL, which ties the identity to a host, and over a new URN scheme, which no
tool knows. Package URLs are already read by tools that list software dependencies.

It builds on [D15](D15%20Extending%20types%20and%20referencing%20corpora%20are%20separate.md): a
referenced corpus is a package, so its records can be named this way.
