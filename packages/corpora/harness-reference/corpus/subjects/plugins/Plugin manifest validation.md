---
slug: plugins/manifest-validation
category: plugins
description: What the harness does with a plugin or marketplace manifest field it does not know, or one with a wrong type, and whether it ships a validator.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    applicable:
      description: Whether validation applies to this harness at all.
      type: boolean
    checks:
      description: What the harness checks.
      type: string
    dependency_warning:
      description: When a dependency draws a warning.
      type: string
    entry_strict:
      description: What a strict entry applies.
      type: string
    hosted_limits:
      description: Size limits on hosted plugins.
      type: string
    invalid_extensions:
      description: What happens to a bad extensions field.
      type: string
    invalid_fields:
      description: What happens on a wrong type or bad path.
      type: string
    marketplace_invalid_entry:
      description: What happens to one invalid marketplace entry.
      type: string
    marketplace_invalid_fields:
      description: What happens on a bad marketplace field.
      type: string
    marketplace_schema:
      description: The marketplace JSON Schema.
      type: string
    marketplace_unknown_fields:
      description: What happens to unknown marketplace fields.
      type: string
    marketplace_validator:
      description: The marketplace validate command.
      type: string
    reader_validation:
      description: What each reader validates.
      type: string
    schema:
      description: The manifest JSON Schema.
      type: string
    schema_unknown_fields:
      description: What the schema does with unknown fields.
      type: string
    schema_validator:
      description: The script that validates the schema.
      type: string
    skill_validator:
      description: The skill validate command and its scope.
      type: string
    strict_objects:
      description: Objects that refuse unknown keys.
      type: string
    unknown_fields:
      description: What happens to a manifest field it does not know.
      type: string
    unsupported_schema_version:
      description: What a client does with a newer schema version.
      type: string
    validator:
      description: The validate command.
      type: string
    validator_checks:
      description: What the validator checks.
      type: string
    validator_scope:
      description: What the validator covers.
      type: string
    validator_strict:
      description: What strict mode does.
      type: string
    validator_warns_on:
      description: What draws a validator warning.
      type: string
  additionalProperties: true
---
