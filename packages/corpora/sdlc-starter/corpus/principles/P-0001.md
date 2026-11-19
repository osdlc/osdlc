---
type: principle
schema_version: '2'
id: P-0001
state: open/draft
title: Normalize equivalent inputs at the boundary, and reject invalid ones
created: 2026-10-24
related: []
tags:
  - principle/technical
need_human_review: true
---

# Normalize equivalent inputs at the boundary, and reject invalid ones

## Statement

When several representations of an input mean the same thing, accept all of
them at the boundary and give them one defined behaviour: the documented
default. Do not guess at an input that is wrong. A malformed value is rejected
with a clear error, and a value that looks like the default but changes
behaviour is kept distinct. This is a narrow form of Postel's law: liberal about
equivalent spellings, strict about meaning.

## Why

Callers read values from config, environment variables, flags and other
tools, and these sources spell "not set" in different ways: `undefined`, `''`,
`null`. A function that accepts only one spelling pushes a workaround, such as
`value || undefined`, into every call site. The workarounds drift, and a missed
one becomes a crash on the default path.

The opposite failure is worse. If a function guesses what a bad or surprising
value probably meant, its behaviour is ambiguous and a caller cannot tell what
it will do.

## How it applies

- Decide which spellings of an input are equivalent, write them down, and
  normalize them in one place at the boundary. Code past the boundary sees one
  form.
- Reject anything that is not equivalent to a valid value. Name the bad value in
  the error.
- Do not fold a value into the default when passing it explicitly changes
  behaviour. An explicit value that overrides an ambient default is not the same
  as leaving it out.
- Test each normalized spelling against the canonical form: it produces the same
  result.

## Examples

- `@osdlc/typed-gh` treats `hostname: ''` as no host, the same as leaving it
  out. A malformed host such as `-x` still throws `RangeError`. `github.com` is
  not treated as no host, because passing it explicitly keeps a call on
  github.com when `GH_HOST` names another host.

## Implications

- A function that normalizes an input documents its equivalents next to the
  parameter.
- It does not say that every input should be accepted. Inputs that are wrong,
  or ambiguous, are errors.

## Notes

- Draft. The wording is a first pass to be rewritten.

## Summary

- Accept equivalent spellings of an input and give them one behaviour. ^summary
- Reject invalid input; never guess what a wrong value meant.
- Keep a value distinct from the default when passing it explicitly changes behaviour.
