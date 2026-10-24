---
'@osdlc/typed-gh': minor
---

`api` keeps GitHub's error body when a request fails: `body` is decoded whatever gh's exit code, and a new `message` field carries `body.message`. `status` is documented as observed only when headers were requested.
