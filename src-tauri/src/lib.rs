#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri_plugin_updater::UpdaterExt;
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::new().build());

  #[cfg(not(any(target_os = "android", target_os = "ios")))]
  let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

  builder
    .setup(|app| {
      // Windows / Linux: file path comes in as a CLI arg
      let args: Vec<String> = std::env::args().collect();
      if let Some(path) = args.get(1) {
        app.emit("file-opened", path).ok();
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_app_handle, _event| {});
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
async fn update(app: tauri::AppHandle) -> tauri_plugin_updater::Result<()> {
  if let Some(update) = app.updater()?.check().await? {
    let mut downloaded = 0;

    // alternatively we could also call update.download() and update.install() separately
    update
      .download_and_install(
        |chunk_length, content_length| {
          downloaded += chunk_length;
          log::info!("downloaded {downloaded} from {content_length:?}");
        },
        || {
          log::info!("download finished");
        },
      )
      .await?;

    log::info!("update installed");
    app.restart();
  }

  Ok(())
}