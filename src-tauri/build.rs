fn main() {
    let manifest = tauri_build::AppManifest::new().commands(&[
        "select_repository",
        "start_analysis",
        "cancel_analysis",
        "read_evidence",
        "query_structure",
        "investigate_snapshot",
        "record_measurement",
        "pilot_measurements",
        "list_repositories",
        "open_repository",
        "forget_repository",
        "local_settings",
        "reopen_analysis",
        "provider_configuration",
        "prepare_explanation",
        "send_explanation",
        "cancel_explanation",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("Desktop build configuration failed");
}
