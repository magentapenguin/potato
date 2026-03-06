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
      #[cfg(not(any(target_os = "android", target_os = "ios")))]
      {
        let handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
          if let Err(e) = update(handle).await {
            log::error!("Failed to update: {e}");
          }
        });
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .unwrap();
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