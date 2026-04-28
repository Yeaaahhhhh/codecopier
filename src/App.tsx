// File: src/App.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import LangSwitcher from "./components/LangSwitcher";
import type {
  CopyResult,
  FileNode,
  FlatRow,
  FolderCopyResult,
  ScanOptions,
  ScanResult
} from "./types";

const ROW_HEIGHT = 28;
const OVERSCAN = 18;

const MAX_FOLDER_COPY_FILES = 300;
const MAX_FOLDER_COPY_SOURCE_BYTES = 12 * 1024 * 1024;

function normalizeSlash(path: string): string {
  return path.replaceAll("\\\\", "/").replaceAll("\\", "/");
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function nodeContains(node: FileNode, q: string): boolean {
  if (!q) return true;
  const hay = `${node.name}\n${normalizeSlash(node.path)}`.toLowerCase();
  if (hay.includes(q)) return true;
  return node.children.some((child) => nodeContains(child, q));
}

function flattenTree(root: FileNode | null, expanded: Set<string>, query: string): FlatRow[] {
  if (!root) return [];
  const q = query.trim().toLowerCase();
  const rows: FlatRow[] = [];

  function walk(node: FileNode, depth: number): void {
    if (!nodeContains(node, q)) return;

    rows.push({ node, depth });

    const shouldOpen = node.is_dir && (expanded.has(node.path) || q.length > 0);
    if (!shouldOpen) return;

    for (const child of node.children) {
      walk(child, depth + 1);
    }
  }

  walk(root, 0);
  return rows;
}

function collectFilesFromNode(node: FileNode): FileNode[] {
  const files: FileNode[] = [];

  function walk(current: FileNode) {
    if (!current.is_dir) {
      files.push(current);
      return;
    }

    for (const child of current.children) {
      walk(child);
    }
  }

  walk(node);
  return files;
}

export default function App() {
  const { t } = useTranslation();

  const [rootPath, setRootPath] = useState<string>("");
  const [tree, setTree] = useState<FileNode | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [copyingPath, setCopyingPath] = useState<string | null>(null);
  const [status, setStatus] = useState(() => t("status.initial"));
  const [error, setError] = useState<string | null>(null);
  const [scanInfo, setScanInfo] = useState<Omit<ScanResult, "root"> | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [listHeight, setListHeight] = useState(500);
  const [options, setOptions] = useState<ScanOptions>({
    skip_heavy_dirs: true,
    include_hidden: false
  });

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updateListHeight = () => {
      const el = listRef.current;
      if (!el) return;
      setListHeight(Math.max(120, el.clientHeight));
    };

    updateListHeight();

    const el = listRef.current;
    if (!el) return;

    const resizeObserver = new ResizeObserver(updateListHeight);
    resizeObserver.observe(el);
    window.addEventListener("resize", updateListHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateListHeight);
    };
  }, []);

  const rows = useMemo(() => flattenTree(tree, expanded, query), [tree, expanded, query]);
  const totalHeight = rows.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(listHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(rows.length, startIndex + visibleCount);
  const visibleRows = rows.slice(startIndex, endIndex);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const maxScrollTop = Math.max(0, totalHeight - el.clientHeight);
    if (el.scrollTop > maxScrollTop) {
      el.scrollTop = maxScrollTop;
      setScrollTop(maxScrollTop);
    }
  }, [totalHeight]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = 0;
    setScrollTop(0);
  }, [tree, query]);

  async function chooseFolder() {
    setError(null);
    const selected = await open({ directory: true, multiple: false, title: t("app.chooseFolder") });
    if (!selected || Array.isArray(selected)) return;

    const path = selected.toString();
    setRootPath(path);
    await scan(path);
  }

  async function scan(path = rootPath) {
    if (!path) return;

    setIsScanning(true);
    setError(null);
    setStatus(t("status.scanningBg"));

    try {
      const result = await invoke<ScanResult>("scan_folder", { path, options });

      setTree(result.root);
      setExpanded(new Set([result.root.path]));
      setScanInfo({
        file_count: result.file_count,
        dir_count: result.dir_count,
        skipped_count: result.skipped_count,
        elapsed_ms: result.elapsed_ms
      });
      setStatus(t("status.scanDone", { files: result.file_count, dirs: result.dir_count }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setStatus(t("status.scanFailed"));
    } finally {
      setIsScanning(false);
    }
  }

  async function copyFile(node: FileNode) {
    if (node.is_dir || !rootPath || copyingPath) return;

    setError(null);
    setCopyingPath(node.path);
    setStatus(t("status.copyingFile", { name: node.name }));

    try {
      const result = await invoke<CopyResult>("copy_file_for_prompt", {
        path: node.path,
        root: rootPath
      });
      setStatus(
        t("status.copiedFile", {
          path: result.path,
          size: formatBytes(result.bytes),
          chars: result.chars.toLocaleString()
        })
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setStatus(t("status.copyFileFailed"));
    } finally {
      setCopyingPath(null);
    }
  }

  async function copyFolder(node: FileNode) {
    if (!node.is_dir || !rootPath || copyingPath) return;

    setError(null);

    const files = collectFilesFromNode(node);
    const totalSourceBytes = files.reduce((sum, file) => sum + (file.size ?? 0), 0);

    if (files.length === 0) {
      setError(t("status.folderNoFiles"));
      setStatus(t("status.copyFolderFailed"));
      return;
    }

    if (files.length > MAX_FOLDER_COPY_FILES) {
      setError(
        t("status.folderTooManyFiles", {
          total: files.length.toLocaleString(),
          max: MAX_FOLDER_COPY_FILES.toLocaleString()
        })
      );
      setStatus(t("status.folderTooLargeBlocked"));
      return;
    }

    if (totalSourceBytes > MAX_FOLDER_COPY_SOURCE_BYTES) {
      setError(
        t("status.folderTooLarge", {
          size: formatBytes(totalSourceBytes),
          max: formatBytes(MAX_FOLDER_COPY_SOURCE_BYTES)
        })
      );
      setStatus(t("status.folderTooLargeBlocked"));
      return;
    }

    setCopyingPath(node.path);
    setStatus(
      t("status.copyingFolder", { name: node.name, total: files.length.toLocaleString() })
    );

    try {
      const result = await invoke<FolderCopyResult>("copy_files_for_prompt", {
        folderPath: node.path,
        root: rootPath,
        filePaths: files.map((file) => file.path)
      });

      const skippedText =
        result.skipped > 0
          ? t("status.copiedFolderSkipped", { skipped: result.skipped.toLocaleString() })
          : "";

      setStatus(
        t("status.copiedFolder", {
          path: result.path,
          files: result.files.toLocaleString(),
          size: formatBytes(result.bytes),
          chars: result.chars.toLocaleString()
        }) + skippedText
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setStatus(t("status.copyFolderFailed"));
    } finally {
      setCopyingPath(null);
    }
  }

  function toggleFolder(node: FileNode) {
    if (!node.is_dir) return;

    const next = new Set(expanded);
    if (next.has(node.path)) {
      next.delete(node.path);
    } else {
      next.add(node.path);
    }
    setExpanded(next);
  }

  async function openNewWindow() {
    setError(null);
    try {
      await invoke("new_window");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void openNewWindow();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div>
            <div className="brand">{t("app.brand")}</div>
            <div className="subtle">{t("app.brandHint")}</div>
          </div>
          <div className="brand-actions">
            <LangSwitcher />
            <button
              className="icon-btn"
              title="New Window (Ctrl+Shift+N)"
              onClick={openNewWindow}
            >
              ＋
            </button>
          </div>
        </div>

        <div className="toolbar">
          <button
            className="primary"
            onClick={chooseFolder}
            disabled={isScanning || copyingPath !== null}
          >
            {t("app.chooseFolder")}
          </button>
          <button
            onClick={() => scan()}
            disabled={!rootPath || isScanning || copyingPath !== null}
          >
            {t("app.rescan")}
          </button>
        </div>

        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("app.searchPlaceholder")}
        />

        <div className="options">
          <label>
            <input
              type="checkbox"
              checked={options.skip_heavy_dirs}
              disabled={isScanning || copyingPath !== null}
              onChange={(e) =>
                setOptions((old) => ({ ...old, skip_heavy_dirs: e.target.checked }))
              }
            />
            {t("app.skipHeavyDirs")}
          </label>
          <label>
            <input
              type="checkbox"
              checked={options.include_hidden}
              disabled={isScanning || copyingPath !== null}
              onChange={(e) =>
                setOptions((old) => ({ ...old, include_hidden: e.target.checked }))
              }
            />
            {t("app.includeHidden")}
          </label>
        </div>

        <div className="path-box" title={rootPath || t("app.noFolderSelected")}>
          {rootPath ? normalizeSlash(rootPath) : t("app.noFolderSelected")}
        </div>

        <div className="tree-panel">
          <div className="tree-header">
            <span>{t("app.treeTitle")}</span>
            <span>{t("app.itemCount", { total: rows.length.toLocaleString() })}</span>
          </div>

          <div
            className="tree-list"
            ref={listRef}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          >
            <div className="tree-spacer" style={{ height: totalHeight }}>
              {visibleRows.length === 0 && (
                <div className="tree-empty">
                  {tree ? t("app.emptySearchHint") : t("app.emptyTreeHint")}
                </div>
              )}

              {visibleRows.map(({ node, depth }, i) => {
                const top = (startIndex + i) * ROW_HEIGHT;
                const isOpen = expanded.has(node.path);
                const isCopyingThis = copyingPath === node.path;

                return (
                  <div
                    key={node.path}
                    className={`tree-row ${node.is_dir ? "dir" : "file"}`}
                    style={{
                      transform: `translateY(${top}px)`,
                      paddingLeft: 10 + depth * 16
                    }}
                    title={normalizeSlash(node.path)}
                    onClick={() => (node.is_dir ? toggleFolder(node) : copyFile(node))}
                  >
                    <span className="chevron">
                      {node.is_dir ? (isOpen || query ? "▾" : "▸") : ""}
                    </span>
                    <span className="file-icon">{node.is_dir ? "📁" : "📄"}</span>
                    <span className="file-name">{node.name}</span>
                    <span className="row-flex-spacer" />
                    {!node.is_dir && (
                      <span className="file-size">{formatBytes(node.size)}</span>
                    )}
                    <button
                      className={`copy-mini ${node.is_dir ? "folder-copy" : "file-copy"}`}
                      title={node.is_dir ? t("app.copyFolderTitle") : t("app.copyFileTitle")}
                      disabled={copyingPath !== null}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (node.is_dir) {
                          void copyFolder(node);
                        } else {
                          void copyFile(node);
                        }
                      }}
                    >
                      {isCopyingThis ? "…" : "⧉"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      <section className="content">
        <div className="hero-card">
          <div className="pill">{t("hero.pill")}</div>
          <h1>{t("hero.heading")}</h1>
          <p>{t("hero.description")}</p>
          <div className="sample">
            <div className="sample-title">{t("hero.sampleTitle")}</div>
            <pre>{`src/App.tsx\nimport React from "react";\n...\n\nsrc/main.tsx\nimport { createRoot } from "react-dom/client";\n...`}</pre>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat">
            <span>{t("stats.status")}</span>
            <strong>
              {isScanning
                ? t("stats.scanning")
                : copyingPath
                  ? t("stats.copying")
                  : t("stats.idle")}
            </strong>
          </div>
          <div className="stat">
            <span>{t("stats.files")}</span>
            <strong>{scanInfo?.file_count.toLocaleString() ?? "-"}</strong>
          </div>
          <div className="stat">
            <span>{t("stats.folders")}</span>
            <strong>{scanInfo?.dir_count.toLocaleString() ?? "-"}</strong>
          </div>
          <div className="stat">
            <span>{t("stats.elapsed")}</span>
            <strong>{scanInfo ? `${scanInfo.elapsed_ms} ms` : "-"}</strong>
          </div>
        </div>

        <div className="status-card">
          <div className="status-line">{status}</div>
          {scanInfo && scanInfo.skipped_count > 0 && (
            <div className="subtle">
              {t("status.skippedHint", { total: scanInfo.skipped_count.toLocaleString() })}
            </div>
          )}
          {error && <div className="error">{error}</div>}
        </div>

        <div className="tips-card">
          <h2>{t("tips.heading")}</h2>
          <ul>
            <li>{t("tips.tip1")}</li>
            <li>{t("tips.tip2")}</li>
            <li>{t("tips.tip3")}</li>
            <li>{t("tips.tip4")}</li>
          </ul>
        </div>
      </section>
    </main>
  );
}