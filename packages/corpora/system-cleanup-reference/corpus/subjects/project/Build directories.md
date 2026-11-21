---
slug: project/build-dirs
category: project
description: Which directories does the tool create inside a project that can be deleted and made again, and which file marks the project?
applies_to: [language-package-manager, toolchain-manager, build-tool, sdk, editor]
valueSchema:
  type: object
  additionalProperties: false
  required: [dirs]
  properties:
    dirs:
      type: array
      minItems: 1
      items:
        type: object
        additionalProperties: false
        required: [path, holds, rebuild]
        properties:
          path: { type: string, minLength: 1 }
          marker: { type: string, minLength: 1 }
          holds: { enum: [build-output, packages, cache, state] }
          rebuild: { enum: [re-download, rebuild] }
---

Directories inside a project, relative to its root, such as Cargo's `target` or npm's
`node_modules`. `marker` is the file beside it that shows the directory is the tool's and not
something else with the same name, such as `Cargo.toml` beside `target`. host-cleaner's artifact
plugins look for these.
