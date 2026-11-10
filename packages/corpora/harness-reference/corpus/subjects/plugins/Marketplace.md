---
slug: plugins/marketplace
category: plugins
description: Whether plugins are distributed through a marketplace, and its format.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    bundles:
      description: What a marketplace plugin can bundle.
      type: string
    file:
      description: The marketplace catalog file name.
      type: string
    git_subpath:
      description: Whether a plugin may live in a subfolder of a git repo.
      type: boolean
    install_id:
      description: The form of the id a user installs by.
      type: string
    note:
      description: A caveat about marketplaces.
      type: string
    supported:
      description: Whether plugins are distributed through a marketplace.
      type: boolean
    basis:
      description: "How an answer of false or absent is known: stated in the docs, left out of the help
        text, or never mentioned."
      enum:
        - documented
        - omitted-from-help
        - undocumented
  additionalProperties: true
---
