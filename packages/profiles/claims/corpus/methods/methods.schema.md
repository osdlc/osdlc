---
$schema: https://json-schema.org/draft/2020-12/schema
title: Method
description: >-
  A set of steps that says how to get a result, such as a test procedure or a review checklist.
  VA-Spec class Method. The record's id, its file name, is the method's name.
type: object
properties:
  methodType:
    description: What kind of method it is, such as test procedure, survey or code review. Free text.
    type: string
    minLength: 1
  reportedIn:
    description: A link to the document that describes the method, when one exists.
    type: string
    x-ref: documents
---

# Methods

One record per method. A method is the set of steps someone follows to get a result: a test
procedure, a survey, a review checklist. A [study result](../study-results/study-results.schema.md)
names the method it followed in `specifiedBy`, so many results can share one method.

The Markdown body holds the steps. Write them so that someone else can follow them and get a
comparable result.

A method that has its own files, such as a script or test fixtures, can be a record folder:
`methods/<Name>/<Name>.md` with the files beside it.
