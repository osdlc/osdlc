---
"@osdlc/typed-gh": minor
---

`api` now keeps GitHub's error body when a request fails. `body` is parsed even when gh exits with an error, and a new `message` field holds `body.message`. `ApiResponse` gains this `message` field as required. `malformed` is now also set when a failed call prints something that is not JSON. The docs now say that `status` is only filled in when headers were requested.
