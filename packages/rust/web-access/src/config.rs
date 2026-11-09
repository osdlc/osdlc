use std::net::IpAddr;

use serde::{Deserialize, Serialize};

/// Which addresses the server listens on.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[non_exhaustive]
pub enum Listen {
    /// 127.0.0.1 only.
    #[default]
    Loopback,
    /// 0.0.0.0: every interface, present and future. Share URLs list the
    /// interface addresses present at start.
    AllInterfaces,
    /// Exactly these addresses.
    Interfaces(Vec<IpAddr>),
}

impl Listen {
    /// True when every address this listens on is loopback.
    pub fn is_loopback_only(&self) -> bool {
        match self {
            Listen::Loopback => true,
            Listen::AllInterfaces => false,
            Listen::Interfaces(ips) => ips.iter().all(IpAddr::is_loopback),
        }
    }
}

/// The user-facing web-access settings. The default is disabled, loopback.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WebAccessConfig {
    /// Whether the server runs at all. [`crate::serve`] refuses a disabled
    /// config.
    pub enabled: bool,
    /// Which addresses to listen on.
    pub listen: Listen,
    /// 0 asks the OS for a free port.
    pub port: u16,
    /// Whether the admin token exists. Off: it is not minted or loaded, so
    /// presenting it grants nothing, and no admin links are published.
    pub admin: bool,
}

impl Default for WebAccessConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            listen: Listen::Loopback,
            port: 0,
            admin: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_disabled_loopback() {
        let c = WebAccessConfig::default();
        assert!(!c.enabled);
        assert_eq!(c.listen, Listen::Loopback);
        assert!(!c.admin);
    }

    #[test]
    fn admin_defaults_off_when_absent_from_stored_config() {
        let c: WebAccessConfig = serde_json::from_str(r#"{"enabled":true}"#).unwrap();
        assert!(!c.admin);
    }

    #[test]
    fn serde_is_camel_case_and_round_trips() {
        let c = WebAccessConfig {
            enabled: true,
            listen: Listen::AllInterfaces,
            port: 8080,
            admin: true,
        };
        let json = serde_json::to_string(&c).unwrap();
        assert_eq!(
            json,
            r#"{"enabled":true,"listen":"allInterfaces","port":8080,"admin":true}"#
        );
        assert_eq!(serde_json::from_str::<WebAccessConfig>(&json).unwrap(), c);
        let ips = serde_json::json!({"listen": {"interfaces": ["192.168.1.5"]}});
        let c: WebAccessConfig = serde_json::from_value(ips).unwrap();
        assert_eq!(
            c.listen,
            Listen::Interfaces(vec!["192.168.1.5".parse().unwrap()])
        );
    }
}
