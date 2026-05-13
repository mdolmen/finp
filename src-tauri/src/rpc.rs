// Bridge to the Python sidecar over line-delimited JSON-RPC 2.0.
// One in-flight request at a time, serialized through a mutex.

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicI64, Ordering};

use serde::Serialize;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::Mutex;

// Structured error returned to the frontend. Mirrors the Python AppError envelope:
// `code` is the JSON-RPC numeric code, `data.code` (when present) is the stable
// string identifier the UI keys off (e.g. "category.in_use").
#[derive(Debug, Serialize, thiserror::Error)]
#[error("rpc error {code}: {message}")]
pub struct RpcError {
    pub code: i64,
    pub message: String,
    pub data: Option<Value>,
}

#[derive(Debug, thiserror::Error)]
pub enum BridgeError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("sidecar exited unexpectedly")]
    Closed,
    #[error("malformed response: {0}")]
    Malformed(String),
    #[error(transparent)]
    Remote(#[from] RpcError),
}

pub struct RpcClient {
    next_id: AtomicI64,
    inner: Mutex<Inner>,
    _child: Child,
}

struct Inner {
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

impl RpcClient {
    pub async fn spawn() -> anyhow::Result<Self> {
        let backend_dir: PathBuf = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("src-tauri has a parent")
            .join("backend");

        // macOS app bundles launch with a minimal PATH that omits ~/.local/bin
        // and other user-level locations where uv is typically installed.
        // Prepend the common locations so the sidecar can be found.
        if let Some(home) = std::env::var_os("HOME") {
            let extras = [
                PathBuf::from(&home).join(".local/bin"),
                PathBuf::from(&home).join(".cargo/bin"),
                PathBuf::from("/opt/homebrew/bin"),
                PathBuf::from("/usr/local/bin"),
            ];
            let current = std::env::var_os("PATH").unwrap_or_default();
            let mut parts: Vec<std::ffi::OsString> = extras
                .iter()
                .map(|p| p.as_os_str().to_owned())
                .collect();
            parts.push(current);
            std::env::set_var("PATH", parts.join(std::ffi::OsStr::new(":")));
        }

        // Dev and release builds share the same binary but use separate databases
        // so test data never pollutes the real one.
        let mut cmd = Command::new("uv");
        cmd.arg("run")
            .arg("--project")
            .arg(&backend_dir)
            .arg("finp-rpc")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .kill_on_drop(true);
        if cfg!(debug_assertions) {
            cmd.env("FINP_DB_PATH", backend_dir.join("dev.db"));
        }
        let mut child = cmd.spawn()?;

        let stdin = child.stdin.take().ok_or_else(|| anyhow::anyhow!("no stdin"))?;
        let stdout = child.stdout.take().ok_or_else(|| anyhow::anyhow!("no stdout"))?;

        Ok(Self {
            next_id: AtomicI64::new(1),
            inner: Mutex::new(Inner { stdin, stdout: BufReader::new(stdout) }),
            _child: child,
        })
    }

    pub async fn request(&self, method: &str, params: Value) -> Result<Value, BridgeError> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let req = json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
        let mut payload = serde_json::to_vec(&req).map_err(|e| BridgeError::Malformed(e.to_string()))?;
        payload.push(b'\n');

        let mut guard = self.inner.lock().await;
        guard.stdin.write_all(&payload).await?;
        guard.stdin.flush().await?;

        let mut line = String::new();
        let n = guard.stdout.read_line(&mut line).await?;
        if n == 0 {
            return Err(BridgeError::Closed);
        }

        let resp: Value = serde_json::from_str(line.trim())
            .map_err(|e| BridgeError::Malformed(e.to_string()))?;

        if let Some(err) = resp.get("error") {
            let code = err.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
            let message = err.get("message").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let data = err.get("data").cloned();
            return Err(BridgeError::Remote(RpcError { code, message, data }));
        }

        resp.get("result")
            .cloned()
            .ok_or_else(|| BridgeError::Malformed("missing result".into()))
    }
}
