fn main() {
    let manifest = tauri_build::AppManifest::new().commands(&["preview_calibration"]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to configure the desktop app");
}
