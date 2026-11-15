---
slug: skills/arguments
category: skills
description: How text typed after a skill invocation reaches the skill.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    cli_only:
      description: Whether arguments work only in the CLI.
      type: boolean
    fallback:
      description: What happens when no placeholder is present.
      type: string
    frontmatter_field:
      description: The frontmatter field for argument hints.
      type: string
    hint_field:
      description: The field that gives an autocomplete hint.
      type: string
    ide:
      description: How arguments work in the IDE.
      type: string
    indexed_arguments:
      description: Whether numbered arguments work.
      type: string
    invocation:
      description: How the skill is invoked.
      type: string
    mechanism:
      description: How the text reaches the skill.
      type: string
    no_placeholder:
      description: What is appended when there is no placeholder.
      type: string
    placeholder:
      description: The placeholder for all arguments.
      type: string
    placeholders:
      description: The placeholders a skill body may use.
      type: array
      items:
        type: string
    sanitizing:
      description: How the argument text is sanitised.
      type: string
    supported:
      description: 'Whether arguments are supported: true, false or "partial".'
      type:
        - boolean
        - string
    syntax:
      description: The invocation syntax.
      type: string
    user_invocation:
      description: What a user token does.
      type: string
    basis:
      description: "How an answer of false or absent is known: stated in the docs, left out of the help
        text, or never mentioned."
      enum:
        - documented
        - omitted-from-help
        - undocumented
  additionalProperties: true
---
