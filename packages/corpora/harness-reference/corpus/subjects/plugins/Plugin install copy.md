---
slug: plugins/install-copy
category: plugins
description: Whether install copies the plugin folder whole, and whether exec bits and symlinks survive.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    copied:
      description: Whether install copies the plugin, and from where.
      type: string
    copied_whole:
      description: Whether the whole folder is copied, and what is left out.
      type: string
    copies:
      description: Whether install copies the plugin folder.
      type: boolean
    helper_scripts:
      description: What happens to helper scripts.
      type: string
    install:
      description: What install does.
      type: string
    link_option:
      description: The option that links instead of copying.
      type: string
    local_package:
      description: How a local package is handled.
      type: string
    local_plugins:
      description: How local plugins are handled.
      type: string
    symlinks:
      description: How symlinks in the plugin are treated.
      type: string
    symlinks_leaving_plugin:
      description: How symlinks pointing out of the plugin are treated.
      type: string
    unpacked_read_only:
      description: Whether the unpacked plugin is read-only.
      type: boolean
    vendored_marketplace_plugins:
      description: Where vendored marketplace plugins come from.
      type: string
  additionalProperties: true
---
