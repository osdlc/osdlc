---
slug: plugins/marketplace-fields
category: plugins
description: "Every field of the marketplace catalog, top level and per plugin entry: its type, whether it is required, and what the harness does with it."
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    also_read:
      description: Other marketplace files the harness also reads.
      type: array
      items:
        type: string
    applicable:
      description: Whether the harness has a marketplace catalog at all.
      type: boolean
    catalog_fields:
      description: The fields of the catalog, each as { name, type, required, use }.
      type: array
      items:
        type: object
    catalog_file:
      description: The catalog file path.
      type: string
    distribution:
      description: How plugins are distributed in place of a catalog.
      type: string
    docs_entry_fields:
      description: Per-plugin entry fields the docs list.
      type: array
      items:
        type: string
    docs_entry_required:
      description: Per-plugin entry fields the docs require.
      type: array
      items:
        type: string
    docs_top_level:
      description: Top-level catalog fields the docs list.
      type: array
      items:
        type: string
    entry_fields:
      description: The fields of a plugin entry, each as { name, type, required, use }.
      type: array
      items:
        type: object
    fields:
      description: The fields of the catalog, each as { name, type, required, use }.
      type: array
      items:
        type: object
    file:
      description: The catalog file path.
      type: string
    files_checked:
      description: Catalog files the harness looks for, in order.
      type: array
      items:
        type: string
    intake_form_build_plugins:
      description: How an author submits a plugin.
      type: string
    interest_form_marketplace:
      description: How an author applies to the marketplace.
      type: string
    listing:
      description: What the docs say about a catalog file.
      type: string
    marketplaces:
      description: Named marketplaces the harness ships with.
      type: array
      items:
        type: string
    note:
      description: A caveat about the catalog.
      type: string
    other_entry_fields:
      description: What happens to entry fields not listed.
      type: string
    schema_entry_fields:
      description: Entry fields from the published JSON Schema.
      type: array
      items:
        type: object
    schema_fields:
      description: Catalog fields from the published JSON Schema.
      type: array
      items:
        type: object
    schema_file:
      description: The published JSON Schema file.
      type: string
    source_forms:
      description: The forms a plugin source may take.
      type: array
      items:
        type: string
    source_path_rule:
      description: How a source path is resolved.
      type: string
  additionalProperties: true
---
