mod rpc;

use serde_json::{json, Value};
use tauri::Manager;

use crate::rpc::RpcClient;

#[tauri::command]
async fn ping(client: tauri::State<'_, RpcClient>) -> Result<Value, String> {
    client.request("ping", json!({})).await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
                    Ok(client) => {
                        handle.manage(client);
                    }
                    Err(e) => log::error!("failed to spawn finp-rpc: {e:#}"),
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![ping])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
