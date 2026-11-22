//! Encode a lease payload and read a push result the way the TypeScript package does.
//!
//! Run with `cargo run --example canonical`.

use ref_lease::{PushFlag, PushOutcome, canonical_json, push_outcome};
use serde_json::json;

fn main() {
    let payload = json!({ "owner": "a", "expires": 1.5 });
    println!("{}", canonical_json(&payload));

    let up_to_date = PushFlag {
        flag: '=',
        rejection: None,
    };
    assert_eq!(push_outcome(up_to_date, true), PushOutcome::Ok);
}
