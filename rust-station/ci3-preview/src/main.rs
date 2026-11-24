#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::webview::{NewWindowResponse, PermissionResponse, WebviewWindowBuilder};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = &app.config().app.windows[0];
            WebviewWindowBuilder::from_config(app, window)?
                .on_navigation(|url| {
                    matches!(
                        url.as_str(),
                        "tauri://localhost" | "tauri://localhost/" | "http://tauri.localhost/"
                    )
                })
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .on_permission_request(|_, _| PermissionResponse::Deny)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to open the GTIS ID Print Station sample");
}
