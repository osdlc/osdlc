---
slug: plugins/manifest
category: plugins
description: The manifest file that makes a directory a plugin or package.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    client_extensions:
      description: How client-specific data is namespaced.
      type: string
    components:
      description: How components are found.
      type: string
    covers:
      description: What the format covers.
      type: string
    documented:
      description: Whether the manifest is documented.
      type: boolean
    fallback:
      description: What makes a folder a plugin with no manifest.
      type: string
    file:
      description: The manifest file path.
      type: string
    files:
      description: The manifest files read.
      type: array
      items:
        type: string
    format:
      description: The manifest format family.
      type: string
    key:
      description: The manifest key that carries the parts.
      type: string
    legacy_discovery_also:
      description: Older manifest files also found.
      type: array
      items:
        type: string
    mcp:
      description: How MCP servers are declared.
      type: string
    name:
      description: What the harness calls a plugin.
      type: string
    optional:
      description: Whether the manifest is optional.
      type: boolean
    required_fields:
      description: Fields the manifest requires.
      type: string
    schema:
      description: The manifest JSON Schema URL.
      type: string
    skills:
      description: How skills are declared.
      type: string
    skills_layout:
      description: Where skills sit in the plugin.
      type: string
  additionalProperties: true
---
