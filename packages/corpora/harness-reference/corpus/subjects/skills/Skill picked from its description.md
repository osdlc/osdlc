---
slug: skills/description-match
category: skills
description: Whether the model picks a skill from its description alone when the user does not name it.
model_dependent: true
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    activation:
      description: How activation is decided.
      type: string
    advice:
      description: What the docs advise for descriptions.
      type: string
    fields:
      description: The fields the model matches on.
      type: array
      items:
        type: string
    guidance:
      description: What the docs advise.
      type: string
    malformed_yaml:
      description: What bad YAML does to matching.
      type: string
    missing_description:
      description: What a missing description does.
      type: string
    model_picks_from_description:
      description: Whether the model picks a skill from its description.
      type: boolean
    reliability:
      description: How reliable matching is.
      type: string
    supported:
      description: Whether description matching works.
      type: boolean
    troubleshooting_advice:
      description: What the docs advise when it fails.
      type: string
    writing_guidance:
      description: How to write a description.
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
