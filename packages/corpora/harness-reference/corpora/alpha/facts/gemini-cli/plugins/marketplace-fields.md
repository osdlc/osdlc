---
type: Harness Fact
title: "Gemini CLI: Marketplace fields"
description: "Marketplace fields in Gemini CLI, as observed over time."
tags: [plugins]
harness: gemini-cli
subject: plugins/marketplace-fields
observations:
  - value: { applicable: false, note: "no catalog file; the geminicli.com gallery crawls public GitHub repositories tagged gemini-cli-extension that have gemini-extension.json at the root" }
    since: null
    until: null
    observed: "2026-11-05"
    source: gemini-cli-releasing-doc
    locator: "docs/extensions/releasing.md:13-30 at 3fd7d263466b9e5d30b2da1ebf85dae956a0fb86"
    evidence: docs
sources:
  - id: gemini-cli-releasing-doc
    resource: "https://github.com/google-gemini/gemini-cli/blob/3fd7d263466b9e5d30b2da1ebf85dae956a0fb86/docs/extensions/releasing.md"
    title: "Gemini CLI docs: Release extensions at 3fd7d26"
---

What the sources say about [Marketplace fields](/subjects/plugins/marketplace-fields.md) in
[Gemini CLI](/harnesses/gemini-cli.md).

## Observations

- 2026-11-05: applicable: `false`. There is no catalog file to write. The gallery indexes public
  repositories by GitHub topic.[^gemini-cli-releasing-doc]

  > The [Gemini CLI extension gallery](https://geminicli.com/extensions/browse/)
  > automatically indexes public extensions to help users discover your work. You
  > don't need to submit an issue or email us to list your extension.
  > ...
  > 2.  **Add the GitHub topic:** Add the `gemini-cli-extension` topic to your
  >     repository's **About** section. Our crawler uses this topic to find new
  >     extensions.

[^gemini-cli-releasing-doc]: Gemini CLI docs: Release extensions at 3fd7d26
