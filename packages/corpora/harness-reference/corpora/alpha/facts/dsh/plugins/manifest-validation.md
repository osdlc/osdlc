---
type: Harness Fact
title: "DeepSeek Harness (dsh): Plugin manifest validation"
description: "Plugin manifest validation in DeepSeek Harness (dsh), as observed over time."
tags: [plugins]
harness: dsh
subject: plugins/manifest-validation
observations:
  - value:
      unknown_fields: ignored
      invalid_fields: "a package.json that is not a JSON object, a dsh.bundle.patch that is not a string or list of strings fails the load; a platforms list that excludes the host skips the bundle; a package with no dsh.bundle installs with a warning as a plain dependency; dsh.manifestVersion and engines.dsh are not enforced"
    since: null
    until: null
    observed: "2026-11-05"
    source: dsh-source
    locator: "packages/boot/app-boot/src/profile.ts:54-60, 548-562; packages/boot/plugin-manager/src/operations.ts:100-112 at fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159"
    evidence: source
  - value: { reader_validation: "each reader validates only the fields it uses; the shared package supplies no parser" }
    since: null
    until: null
    observed: "2026-11-05"
    source: dsh-package-manifest-readme
    locator: "Known Limitations and Deferred Work"
    evidence: docs
open:
  - question: "Does dsh ship a validate command or a published JSON Schema for the dsh block? None was found; the types package says it has no parser."
    observed: "2026-11-05"
    source: dsh-package-manifest-readme
sources:
  - id: dsh-source
    resource: "https://github.com/deepseek-ai/deepseek-harness/tree/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/boot"
    title: "deepseek-ai/deepseek-harness boot packages at fcc0ad4"
  - id: dsh-package-manifest-readme
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/util/package-manifest/README.md"
    title: "deepseek-ai/deepseek-harness package-manifest README at fcc0ad4"
---

What the sources say about [Plugin manifest validation](/subjects/plugins/manifest-validation.md)
in [DeepSeek Harness (dsh)](/harnesses/dsh.md).

## Observations

- 2026-11-05: unknown fields: ignored (the file is parsed and cast). A non-object file or a bad
  `dsh.bundle.patch` fails the load; a package with no bundle installs with a
  warning.[^dsh-source]

  ```ts
    const parsed = JSON.parse(raw) as ProfileManifest | null
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${binName}: profile manifest ${path} must hold a JSON object`)
  ...
      throw new Error('dsh.bundle.patch must be a file path or a list of file paths')
  ...
        options.onOutput?.(`dsh: warning: ${name} declares no dsh.bundle — installed as a plain dependency, not a profile layer\n`, 'stderr')
  ```

- 2026-11-05: each reader validates only what it uses; compatibility fields are not
  enforced.[^dsh-package-manifest-readme]

  > - **Static typing only.** Consumers read and validate the JSON fields they use, then adapt the shared declarations to their runtime data. The package supplies no parser, getter helpers, file checks, or defaults.
  > - **Compatibility is declarative.** Current installers and loaders do not enforce `dsh.manifestVersion` or `engines.dsh`; declaring a range does not reject incompatible hosts or validate SemVer syntax.

## Open questions

- Does dsh ship a validate command or a published JSON Schema for the `dsh` block? None was found.[^dsh-package-manifest-readme]

[^dsh-source]: deepseek-ai/deepseek-harness boot packages at fcc0ad4
[^dsh-package-manifest-readme]: deepseek-ai/deepseek-harness package-manifest README at fcc0ad4
