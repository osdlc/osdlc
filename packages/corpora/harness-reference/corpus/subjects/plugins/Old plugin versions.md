---
slug: plugins/upgrade-retention
category: plugins
description: Whether earlier plugin versions stay on disk after an upgrade.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    mechanism:
      description: How an update replaces the installed copy.
      type: string
    new_agent:
      description: What a newly started agent sees after an update.
      type: string
    old_version_kept:
      description: Whether the previous version stays on disk.
      type: boolean
    old_versions_kept:
      description: Whether earlier versions stay on disk.
      type: boolean
    plugin_data:
      description: What happens to plugin data across updates.
      type: string
    retention:
      description: How long old versions are kept.
      type: string
    running_cloud_agent:
      description: What a running cloud agent keeps.
      type: string
    update:
      description: What an update does.
      type: string
    version_use:
      description: How the version field is used.
      type: string
  additionalProperties: true
---
