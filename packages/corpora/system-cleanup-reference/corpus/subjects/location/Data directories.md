---
slug: location/data-dirs
category: location
description: Where does the store keep data that can be reclaimed, on each platform, and what does deleting it cost?
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
        required: [platform, path, holds, rebuild]
        properties:
          platform: { enum: [all, macos, linux, windows] }
          path: { type: string, minLength: 1 }
          holds: { enum: [cache, downloads, packages, toolchains, models, build-output, images, logs, state] }
          rebuild: { enum: [re-download, rebuild, lost] }
---

The default locations, before any override. `holds` says what the directory contains. `rebuild`
says what deleting it costs: `re-download` (fetched again on demand), `rebuild` (regenerated on
this machine), or `lost` (user data that cannot come back, such as an imported model or a
container volume). A cleaner may delete only `re-download` and `rebuild` directories without a
person's say.
