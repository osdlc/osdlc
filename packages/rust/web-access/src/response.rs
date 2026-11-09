//! Small refusal responses shared by the guard and the policy layer.

use axum::body::Body;
use axum::http::{StatusCode, header};
use axum::response::Response;

pub(crate) fn refuse(status: StatusCode, msg: &'static str) -> Response {
    Response::builder()
        .status(status)
        .body(Body::from(msg))
        .expect("static response")
}

pub(crate) fn json_response(status: StatusCode, body: &serde_json::Value) -> Response {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .expect("json response")
}
