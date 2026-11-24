#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::Serialize;
use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};

#[derive(Serialize)]
struct CalibrationPreview {
    front: String,
    back: String,
}

#[tauri::command]
async fn preview_calibration() -> Result<CalibrationPreview, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let card = id_card_calibration::render_calibration_card()
            .map_err(|_| "Failed to render the test card".to_owned())?;
        Ok(CalibrationPreview {
            front: STANDARD.encode(card.front_png),
            back: STANDARD.encode(card.back_png),
        })
    })
    .await
    .map_err(|_| "The test card renderer stopped".to_owned())?
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = &app.config().app.windows[0];
            let dev_url = app.config().build.dev_url.clone();
            WebviewWindowBuilder::from_config(app, window)?
                .on_navigation(move |url| {
                    if tauri::is_dev() && dev_url.as_ref() == Some(url) {
                        return true;
                    }
                    matches!(
                        url.as_str(),
                        "tauri://localhost" | "tauri://localhost/" | "http://tauri.localhost/"
                    )
                })
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![preview_calibration])
        .run(tauri::generate_context!())
        .expect("failed to open ID Print Station");
}
