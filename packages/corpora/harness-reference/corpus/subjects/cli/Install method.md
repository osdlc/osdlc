---
slug: cli/install
category: cli
description: How is the harness installed, updated and removed?
valueSchema:
  description: How the harness is installed.
  type: object
  properties:
    supported:
      description: 'Whether the harness supports it: true, false, or "partial" where only part works.'
      type:
        - boolean
        - string
      enum:
        - true
        - false
        - partial
    methods:
      description: The install methods the vendor documents.
      type: array
      items:
        description: One way to install.
        type: object
        properties:
          kind:
            description: The channel.
            enum:
              - npm
              - pip
              - brew
              - cargo
              - script
              - binary
              - app
              - other
          argv:
            description: The command to run, as an argument list.
            type: array
            items:
              type: string
          package:
            description: The package or download name.
            type: string
          platforms:
            description: Operating systems it covers; empty means all.
            type: array
            items:
              enum:
                - macos
                - linux
                - windows
          note: &a2
            description: A caveat the other keys do not carry.
            type: string
        required:
          - kind
        additionalProperties: true
    update:
      description: How an installed copy updates, such as self-update or the package manager.
      type: string
    uninstall:
      description: How to remove it.
      type: string
    note: *a2
    basis:
      description: "How an answer of false or absent is known: stated in the docs, left out of the help
        text, or never mentioned."
      enum:
        - documented
        - omitted-from-help
        - undocumented
  additionalProperties: true
---

The ways to put the harness on a machine: a package manager, an install script or a download, with the command for each, plus how it updates itself and how to remove it. A tool that installs a harness for a user, or tells them how, reads this.
