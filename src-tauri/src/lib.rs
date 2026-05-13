mod rpc;

use serde_json::Value;
use tauri::Manager;

use crate::rpc::{BridgeError, RpcClient, RpcError};

// Single generic bridge command. The frontend addresses Python methods by name
// (e.g. "accounts.list") and gets either the result value or a structured error.
#[tauri::command]
async fn rpc(
    client: tauri::State<'_, RpcClient>,
    method: String,
    params: Option<Value>,
) -> Result<Value, RpcError> {
    let params = params.unwrap_or_else(|| serde_json::json!({}));
    match client.request(&method, params).await {
        Ok(value) => Ok(value),
        Err(BridgeError::Remote(err)) => Err(err),
        Err(other) => Err(RpcError {
            code: -32603,
            message: other.to_string(),
            data: None,
        }),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match RpcClient::spawn().await {
                    Ok(client) => { handle.manage(client); }
                    Err(e) => log::error!("failed to spawn finp-rpc: {e:#}"),
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![rpc])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
