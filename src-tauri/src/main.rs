// File: src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use arboard::Clipboard;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};
use std::time::Instant;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const MAX_COPY_BYTES: u64 = 20 * 1024 * 1024;
const MAX_FOLDER_COPY_FILES: usize = 300;
const MAX_FOLDER_COPY_SOURCE_BYTES: u64 = 12 * 1024 * 1024;
const MAX_FOLDER_COPY_PAYLOAD_BYTES: u64 = 16 * 1024 * 1024;

static WINDOW_COUNTER: AtomicU64 = AtomicU64::new(1);

const SKIP_DIRS: &[&str] = &[
    ".git",
    ".svn",
    ".hg",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".turbo",
    ".cache",
    ".parcel-cache",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    "coverage",
    "vendor",
    "Pods",
    "DerivedData",
];

const SKIP_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "icns", "svgz",
    "mp4", "mov", "avi", "mkv", "webm", "mp3", "wav", "flac", "ogg",
    "zip", "rar", "7z", "tar", "gz", "bz2", "xz",
    "exe", "dll", "pdb", "so", "dylib", "bin", "dat",
    "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx",
    "lock", "map",
];

#[derive(Debug, Serialize)]
struct FileNode {
    id: String,
    name: String,
    path: String,
    is_dir: bool,
    children: Vec<FileNode>,
    size: Option<u64>,
}

#[derive(Debug, Serialize)]
struct ScanResult {
    root: FileNode,
    file_count: u64,
    dir_count: u64,
    skipped_count: u64,
    elapsed_ms: u128,
}

#[derive(Debug, Deserialize, Clone)]
struct ScanOptions {
    skip_heavy_dirs: bool,
    include_hidden: bool,
}

#[derive(Default)]
struct ScanStats {
    file_count: u64,
    dir_count: u64,
    skipped_count: u64,
}

#[derive(Debug, Serialize)]
struct CopyResult {
    path: String,
    bytes: u64,
    chars: usize,
}

#[derive(Debug, Serialize)]
struct FolderCopyResult {
    path: String,
    files: u64,
    skipped: u64,
    bytes: u64,
    chars: usize,
}

struct TextBlock {
    rel_path: String,
    payload: String,
    source_bytes: u64,
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| normalize_path(path))
}

fn relative_path(path: &Path, root: &Path) -> String {
    let rel = path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");

    if rel.is_empty() {
        ".".to_string()
    } else {
        rel
    }
}

fn is_hidden_name(name: &str) -> bool {
    name.starts_with('.')
}

fn should_skip(path: &Path, is_dir: bool, options: &ScanOptions) -> bool {
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default();

    if !options.include_hidden && is_hidden_name(name) {
        return true;
    }

    if is_dir
        && options.skip_heavy_dirs
        && SKIP_DIRS
            .iter()
            .any(|skip| name.eq_ignore_ascii_case(skip))
    {
        return true;
    }

    false
}

fn should_skip_extension(path: &Path) -> bool {
    let Some(ext) = path.extension().and_then(|s| s.to_str()) else {
        return false;
    };

    SKIP_EXTENSIONS
        .iter()
        .any(|skip| ext.eq_ignore_ascii_case(skip))
}

fn sort_entries(a: &fs::DirEntry, b: &fs::DirEntry) -> Ordering {
    let a_is_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
    let b_is_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);

    match (a_is_dir, b_is_dir) {
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        _ => a
            .file_name()
            .to_string_lossy()
            .to_lowercase()
            .cmp(&b.file_name().to_string_lossy().to_lowercase()),
    }
}

fn scan_dir(
    path: &Path,
    options: &ScanOptions,
    stats: &mut ScanStats,
) -> Result<FileNode, String> {
    let meta = fs::metadata(path)
        .map_err(|e| format!("无法读取元数据 {}: {}", normalize_path(path), e))?;
    let is_dir = meta.is_dir();

    if !is_dir {
        stats.file_count += 1;
        return Ok(FileNode {
            id: normalize_path(path),
            name: display_name(path),
            path: normalize_path(path),
            is_dir: false,
            children: Vec::new(),
            size: Some(meta.len()),
        });
    }

    stats.dir_count += 1;
    let mut node = FileNode {
        id: normalize_path(path),
        name: display_name(path),
        path: normalize_path(path),
        is_dir: true,
        children: Vec::new(),
        size: None,
    };

    let mut entries: Vec<fs::DirEntry> = match fs::read_dir(path) {
        Ok(read_dir) => read_dir.filter_map(Result::ok).collect(),
        Err(_) => {
            stats.skipped_count += 1;
            return Ok(node);
        }
    };

    entries.sort_by(sort_entries);

    for entry in entries {
        let child_path = entry.path();
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => {
                stats.skipped_count += 1;
                continue;
            }
        };

        if file_type.is_symlink() {
            stats.skipped_count += 1;
            continue;
        }

        let child_is_dir = file_type.is_dir();
        if should_skip(&child_path, child_is_dir, options) {
            stats.skipped_count += 1;
            continue;
        }

        match scan_dir(&child_path, options, stats) {
            Ok(child) => node.children.push(child),
            Err(_) => stats.skipped_count += 1,
        }
    }

    Ok(node)
}

fn run_scan(path: PathBuf, options: ScanOptions) -> Result<ScanResult, String> {
    if !path.exists() {
        return Err(format!("路径不存在：{}", normalize_path(&path)));
    }
    if !path.is_dir() {
        return Err(format!(
            "请选择文件夹，不是文件：{}",
            normalize_path(&path)
        ));
    }

    let start = Instant::now();
    let mut stats = ScanStats::default();
    let root = scan_dir(&path, &options, &mut stats)?;

    Ok(ScanResult {
        root,
        file_count: stats.file_count,
        dir_count: stats.dir_count,
        skipped_count: stats.skipped_count,
        elapsed_ms: start.elapsed().as_millis(),
    })
}

fn looks_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8192).any(|b| *b == 0)
}

fn read_text_block(path: &Path, root: &Path, max_file_bytes: u64) -> Result<TextBlock, String> {
    if !path.is_file() {
        return Err(format!("不是可复制的文件：{}", normalize_path(path)));
    }

    if should_skip_extension(path) {
        return Err(format!(
            "已跳过非代码或重型文件：{}",
            normalize_path(path)
        ));
    }

    let meta = fs::metadata(path)
        .map_err(|e| format!("无法读取文件元数据 {}: {}", normalize_path(path), e))?;
    if meta.len() > max_file_bytes {
        return Err(format!(
            "文件超过 {} MB，已跳过：{}",
            max_file_bytes / 1024 / 1024,
            normalize_path(path)
        ));
    }

    let bytes =
        fs::read(path).map_err(|e| format!("无法读取文件 {}: {}", normalize_path(path), e))?;
    if looks_binary(&bytes) {
        return Err(format!("疑似二进制文件，已跳过：{}", normalize_path(path)));
    }

    let content = match String::from_utf8(bytes) {
        Ok(text) => text,
        Err(err) => {
            let raw = err.into_bytes();
            String::from_utf8_lossy(&raw).to_string()
        }
    };

    let rel_path = relative_path(path, root);
    let mut payload = String::with_capacity(rel_path.len() + content.len() + 2);
    payload.push_str(&rel_path);
    payload.push('\n');
    payload.push_str(&content);

    Ok(TextBlock {
        rel_path,
        payload,
        source_bytes: meta.len(),
    })
}

fn write_clipboard(payload: String) -> Result<(), String> {
    let mut clipboard =
        Clipboard::new().map_err(|e| format!("无法打开系统剪贴板：{}", e))?;
    clipboard
        .set_text(payload)
        .map_err(|e| format!("写入剪贴板失败：{}", e))
}

fn run_copy_file(path: PathBuf, root: PathBuf) -> Result<CopyResult, String> {
    let block = read_text_block(&path, &root, MAX_COPY_BYTES)?;
    let chars = block.payload.chars().count();
    write_clipboard(block.payload)?;

    Ok(CopyResult {
        path: block.rel_path,
        bytes: block.source_bytes,
        chars,
    })
}

fn run_copy_files(
    folder_path: PathBuf,
    root: PathBuf,
    file_paths: Vec<String>,
) -> Result<FolderCopyResult, String> {
    if !folder_path.exists() {
        return Err(format!(
            "文件夹不存在：{}",
            normalize_path(&folder_path)
        ));
    }

    if !folder_path.is_dir() {
        return Err(format!("不是文件夹：{}", normalize_path(&folder_path)));
    }

    if file_paths.is_empty() {
        return Err("没有可复制的文件。".to_string());
    }

    if file_paths.len() > MAX_FOLDER_COPY_FILES {
        return Err(format!(
            "文件数量过多：{} 个，超过上限 {} 个。请选择更小的子文件夹。",
            file_paths.len(),
            MAX_FOLDER_COPY_FILES
        ));
    }

    let mut estimated_source_bytes = 0_u64;
    for file_path in &file_paths {
        let path = PathBuf::from(file_path);
        if let Ok(meta) = fs::metadata(&path) {
            estimated_source_bytes = estimated_source_bytes.saturating_add(meta.len());
        }

        if estimated_source_bytes > MAX_FOLDER_COPY_SOURCE_BYTES {
            return Err(format!(
                "文件夹累计大小超过 {} MB，已提前阻止复制，避免长时间等待或剪贴板卡死。",
                MAX_FOLDER_COPY_SOURCE_BYTES / 1024 / 1024
            ));
        }
    }

    let folder_rel_path = relative_path(&folder_path, &root);
    let mut payload = String::new();
    let mut copied_files = 0_u64;
    let mut skipped = 0_u64;
    let mut source_bytes = 0_u64;
    let mut payload_bytes = 0_u64;

    for file_path in file_paths {
        let path = PathBuf::from(file_path);

        let block = match read_text_block(&path, &root, MAX_COPY_BYTES) {
            Ok(block) => block,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };

        let mut block_payload = block.payload;
        if !block_payload.ends_with('\n') {
            block_payload.push('\n');
        }

        let separator_bytes = if payload.is_empty() { 0 } else { 1 };
        let block_bytes = block_payload.as_bytes().len() as u64;
        let next_payload_bytes = payload_bytes + separator_bytes + block_bytes;

        if next_payload_bytes > MAX_FOLDER_COPY_PAYLOAD_BYTES {
            skipped += 1;
            continue;
        }

        if !payload.is_empty() {
            payload.push('\n');
        }

        payload.push_str(&block_payload);
        payload_bytes = next_payload_bytes;
        source_bytes += block.source_bytes;
        copied_files += 1;
    }

    if copied_files == 0 {
        return Err(
            "没有复制任何文件。可能全部是二进制文件、lock/map 文件或超大文件。".to_string(),
        );
    }

    let chars = payload.chars().count();
    write_clipboard(payload)?;

    Ok(FolderCopyResult {
        path: folder_rel_path,
        files: copied_files,
        skipped,
        bytes: source_bytes,
        chars,
    })
}

#[tauri::command]
async fn scan_folder(path: String, options: ScanOptions) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_scan(PathBuf::from(path), options))
        .await
        .map_err(|e| format!("后台扫描任务失败：{}", e))?
}

#[tauri::command]
async fn copy_file_for_prompt(path: String, root: String) -> Result<CopyResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_copy_file(PathBuf::from(path), PathBuf::from(root))
    })
    .await
    .map_err(|e| format!("后台复制任务失败：{}", e))?
}

#[tauri::command]
async fn copy_files_for_prompt(
    folder_path: String,
    root: String,
    file_paths: Vec<String>,
) -> Result<FolderCopyResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_copy_files(PathBuf::from(folder_path), PathBuf::from(root), file_paths)
    })
    .await
    .map_err(|e| format!("后台复制文件夹任务失败：{}", e))?
}

#[tauri::command]
async fn new_window(app: AppHandle) -> Result<(), String> {
    let count = WINDOW_COUNTER.fetch_add(1, AtomicOrdering::SeqCst);
    let label = format!("cc-{}", count);

    let url = if cfg!(debug_assertions) {
        // 开发模式：使用 devUrl
        WebviewUrl::External(
            "http://127.0.0.1:1420"
                .parse()
                .map_err(|e| format!("无效的开发地址：{}", e))?,
        )
    } else {
        // 生产模式：使用打包的前端资源
        WebviewUrl::App("index.html".into())
    };

    // 使用 spawn 确保窗口创建在主线程事件循环中完成
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = app_clone.run_on_main_thread(move || {
            let builder = WebviewWindowBuilder::new(&app, &label, url)
                .title("Code Copier")
                .inner_size(1200.0, 800.0)
                .min_inner_size(900.0, 600.0)
                .resizable(true)
                .center();

            match builder.build() {
                Ok(window) => {
                    let _ = window.set_focus();
                }
                Err(e) => {
                    eprintln!("创建新窗口失败：{}", e);
                }
            }
        });
    });

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            scan_folder,
            copy_file_for_prompt,
            copy_files_for_prompt,
            new_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running Code Copier");
}