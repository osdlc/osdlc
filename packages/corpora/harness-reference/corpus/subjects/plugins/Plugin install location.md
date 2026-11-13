---
slug: plugins/install-location
category: plugins
description: Where an installed plugin's files go, and whether a local plugin is copied or used in place.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    claude_equivalents:
      description: Claude Code locations that also work.
      type: string
    declaration_file:
      description: The file where installed packages are recorded.
      type: string
    detail:
      description: What the docs say about install sources.
      type: string
    dev_install:
      description: How a development install works.
      type: string
    direct:
      description: Where a direct install goes.
      type: string
    discovery_dirs:
      description: Directories scanned for plugins.
      type: array
      items:
        type: string
    format:
      description: What an installed package is.
      type: string
    git:
      description: How a git source is installed.
      type: string
    hosted_import:
      description: How a plugin is imported to hosted storage.
      type: string
    layout:
      description: How an installed plugin is laid out.
      type: string
    link_command:
      description: The command that links a development folder.
      type: string
    local:
      description: How a local plugin is loaded.
      type: string
    local_install:
      description: What installing a local path does.
      type: string
    local_marketplace_plugins:
      description: How local marketplace plugins load.
      type: string
    local_marketplace_relative_path:
      description: How a relative path in a local marketplace loads.
      type: string
    local_method:
      description: How a local plugin is installed by hand.
      type: string
    local_path_install:
      description: What installing a local path does.
      type: string
    local_plugin:
      description: How a local plugin is loaded.
      type: string
    local_plugin_folder:
      description: The folder for local plugins.
      type: string
    local_plugin_version:
      description: The version label of a local plugin.
      type: string
    local_plugins:
      description: How local plugins are loaded.
      type: string
    machine_skills:
      description: Where machine-wide skills install.
      type: string
    marketplace:
      description: Where a marketplace plugin installs.
      type: string
    marketplace_plugins:
      description: Where a marketplace plugin installs.
      type: string
    npm:
      description: Where an npm package installs.
      type: string
    npm_plugins:
      description: Where npm plugins install.
      type: string
    path:
      description: Where an installed plugin goes.
      type: string
    prescribed:
      description: Whether the standard prescribes an install location.
      type: boolean
    project:
      description: The project-level plugin folder.
      type: string
    project_plugins:
      description: The project-level plugin folder.
      type: string
    root_override:
      description: The variable that overrides the install root.
      type: string
    system_plugins:
      description: The system-level plugin folder.
      type: string
    uninstall:
      description: What uninstall does.
      type: string
    user:
      description: The user-level plugin folder.
      type: string
    workspace_path:
      description: The workspace plugin folder.
      type: string
  additionalProperties: true
---
