---
corpus-schema: 0
level: 2
extends:
  claims: ../corpus
uses: [claims/documents, claims/methods, claims/statements]
---

# Claims example

A small corpus that shows the claims types at work. It checks a claim about a made-up command line
tool, fernlog: that version 2.3 reads its config file from `~/.config/fernlog/config.toml`.

The claim is a [statement](statements/). It is backed by three
[study results](study-results/): what the tool's README says, and two test
runs, one on Linux and one on macOS. The runs follow one [method](methods/), and
the README is a [document](documents/).

Start with the statement, [fernlog config path](statements/fernlog%20config%20path.md). A second
statement, [fernlog config path on Linux](statements/fernlog%20config%20path%20on%20Linux.md), makes
the same claim for Linux only. It shows a field the claims types do not define, and a proposition
whose object is a structured value. A third,
[fernlog config paths by platform](statements/fernlog%20config%20paths%20by%20platform.md), lists
the paths fernlog reads on each platform, as a list of objects.

The two test runs sit in subfolders, `study-results/linux/` and `study-results/macos/`. A subfolder
groups records. It is not part of their ids.

The four types come from the claims profile. The root file names it under `extends` by the path
`../corpus`. `uses` gives all four type folders the profile's type as it is, with no schema file of
their own. To add fields to one later, take it out of `uses` and write a schema with `x-extends`. The types follow GA4GH's Variant
Annotation Specification (VA-Spec). The
[mapping note](https://github.com/osdlc/markdown/blob/main/profiles/claims/README.md) says which of
its classes and fields each type takes.
