fn main() {
    let manifest = tauri_build::AppManifest::new().commands(&[
        "select_repository",
        "start_analysis",
        "cancel_analysis",
        "read_evidence",
        "query_structure",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("Desktop build configuration failed");
}
