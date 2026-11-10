---
slug: cli/context-dirs
category: cli
description: How does a caller give a run access to directories beyond the working directory?
valueSchema:
  description: How extra directories are added.
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
    argv:
      description: The arguments that add one directory, with {dir} for it, such as ["--add-dir","{dir}"].
      type: array
      items:
        type: string
    repeatable:
      description: Whether the flag may be given more than once.
      type: boolean
    env:
      description: Environment variables that add directories.
      type: object
      additionalProperties:
        type: string
    config_key:
      description: The config key that lists them.
      type: string
    trusted:
      description: Whether added directories load config and skills as the project does.
      type: string
    note:
      description: A caveat the other keys do not carry.
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

A run starts in one directory, but a task may need others: a sibling repository or a shared folder. This subject records the flag, setting or variable that adds directories, whether it repeats and whether the added directories are trusted like the project.
