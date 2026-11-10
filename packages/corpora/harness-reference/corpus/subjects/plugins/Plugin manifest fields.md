---
slug: plugins/manifest-fields
category: plugins
description: "Every top-level field the plugin manifest takes: its type, whether it is required, and what the harness does with it."
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    agent_plugin_fields:
      description: Fields of the Agent Plugins root manifest, each as { name, type, required, use }.
      type: array
      items:
        type: object
    agent_plugin_file:
      description: The Agent Plugins manifest file name.
      type: string
    also_loaded:
      description: Other manifests loaded too.
      type: string
    also_loads:
      description: Other manifests it loads.
      type: string
    also_read:
      description: Other manifest locations it reads.
      type:
        - array
        - string
      items:
        type: string
    applicable:
      description: Whether a manifest applies to this harness at all.
      type: boolean
    claude_fields_converted:
      description: Claude manifest fields converted on load.
      type: array
      items:
        type: string
    claude_file:
      description: The Claude manifest file read.
      type: string
    defaults:
      description: Defaults used when a field is missing.
      type: object
    docs_fields:
      description: Fields the docs list, each as { name, type, required, use }.
      type: array
      items:
        type:
          - object
          - string
    docs_name_pattern:
      description: The pattern a plugin name must match, per the docs.
      type: string
    docs_omit:
      description: Fields the docs leave out.
      type: array
      items:
        type: string
    docs_publish_checklist:
      description: Fields to fill before publishing.
      type: array
      items:
        type: string
    docs_required_for_marketplace:
      description: Fields a marketplace listing needs.
      type: array
      items:
        type: string
    fallback_files:
      description: Files tried when no manifest names a part.
      type: string
    fields:
      description: The manifest fields, each as { name, type, required, use }.
      type: array
      items:
        type: object
    file:
      description: The manifest file path.
      type: string
    files_checked:
      description: Manifest files the harness looks for, in order.
      type: array
      items:
        type: string
    gemini_fields:
      description: Fields of the Gemini manifest, each as { name, type, required, use }.
      type: array
      items:
        type: object
    gemini_file:
      description: The Gemini manifest file name.
      type: string
    installed_metadata:
      description: What metadata shows for an installed plugin.
      type: string
    legacy_also_read:
      description: Older manifest files also read.
      type: array
      items:
        type: string
    legacy_fields:
      description: Fields of the older manifest.
      type: array
      items:
        type: object
    legacy_file:
      description: The older manifest file.
      type: string
    legacy_files:
      description: Older manifest files read.
      type: array
      items:
        type: string
    not_in_manifest:
      description: What is found by directory, not by manifest.
      type: string
    note:
      description: A caveat about the manifest.
      type: string
    overlay_rule:
      description: How an extension overlay applies.
      type: string
    plugin_form:
      description: What a plugin file is.
      type: string
    plugin_id:
      description: Where the plugin id comes from.
      type: string
    precedence:
      description: Which manifest wins.
      type: string
    published_docs_manifest:
      description: The manifest the published docs describe.
      type: string
    published_docs_note:
      description: What the published docs say.
      type: string
    schema_closed:
      description: Whether the schema refuses unknown fields.
      type: boolean
    schema_fields:
      description: Fields in the published JSON Schema.
      type: array
      items:
        type:
          - object
          - string
    schema_file:
      description: The published JSON Schema file.
      type: string
    schema_required:
      description: Fields the schema requires.
      type: array
      items:
        type: string
  additionalProperties: true
---
