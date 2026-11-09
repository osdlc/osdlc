//! Embed the sharing runtime behind a settings page: it saves the config,
//! starts or stops the server to match, and reports share links per grant.
//!
//! Run with `cargo run --example sharing_runtime`.

use std::sync::Mutex;

use axum::Router;
use axum::routing::get;
use web_access::{ConfigStore, Grant, Listen, SharingRuntime, WebAccessConfig};

/// Where the app keeps its settings. A real app writes a file or a database
/// row; this one keeps them in memory.
#[derive(Default)]
struct MemoryStore(Mutex<Option<WebAccessConfig>>);

impl ConfigStore for MemoryStore {
    fn load(&self) -> Result<WebAccessConfig, String> {
        let stored = self.0.lock().map_err(|e| e.to_string())?;
        Ok(stored.clone().unwrap_or_default())
    }

    fn save(&self, cfg: &WebAccessConfig) -> Result<(), String> {
        *self.0.lock().map_err(|e| e.to_string())? = Some(cfg.clone());
        Ok(())
    }
}

/// Runs the example; `tests/examples.rs` runs it too.
#[tokio::main]
pub async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let token_dir = std::env::temp_dir().join(format!("web-access-runtime-{}", std::process::id()));
    let runtime = SharingRuntime::new(MemoryStore::default(), token_dir.clone(), || {
        Router::new().route("/", get(|| async { "shared app" }))
    });

    // Nothing stored: sharing is off.
    let status = runtime.start_from_store().await?;
    assert!(!status.running);

    // The user turns sharing on from the settings page.
    let status = runtime
        .set(WebAccessConfig {
            enabled: true,
            listen: Listen::Loopback,
            port: 0,
            admin: false,
        })
        .await?;
    assert!(status.running);
    let full_link = status.share_urls.full[0].clone();
    let read_link = status.share_urls.read[0].clone();
    // Admin is off, so there is no admin link.
    assert!(status.share_urls.admin.is_empty());

    // A copy for a remote peer to read carries no tokens.
    let public = status.without_tokens();
    assert!(!public.share_urls.full[0].contains("token="));

    // Rotating the read token changes only the read link.
    let status = runtime.rotate(Grant::Read).await?;
    assert_ne!(status.share_urls.read[0], read_link);
    let full_after = &status.share_urls.full[0];
    let same_full_token = full_after.split("token=").nth(1) == full_link.split("token=").nth(1);
    assert!(same_full_token);

    // Turning sharing off stops the server.
    let status = runtime
        .set(WebAccessConfig {
            enabled: false,
            ..WebAccessConfig::default()
        })
        .await?;
    assert!(!status.running);

    println!("full link: {full_link}");
    println!("read link rotated, full link kept: {same_full_token}");

    std::fs::remove_dir_all(&token_dir)?;
    Ok(())
}
