---
slug: cli/model-selection
category: cli
description: Flags that pick the model, provider and reasoning effort for a run.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    acp_effort:
      type: string
    context:
      type: string
    effort:
      type: string
    model:
      type: string
    model_list:
      type: string
    provider:
      type: string
  additionalProperties: true
---
