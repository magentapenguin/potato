#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri_plugin_updater::UpdaterExt;

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
    .unwrap()
    .run(|app_handle, event| {
      // macOS: file open events come through RunEvent::Opened
      if let tauri::RunEvent::Opened { urls } = event {
        let paths: Vec<String> = urls.iter()
          .filter_map(|u| u.to_file_path().ok())
          .filter_map(|p| p.to_str().map(|s| s.to_string()))
          .collect();
        for path in paths {
          app_handle.emit("file-opened", &path).ok();
        }
      }
    });
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